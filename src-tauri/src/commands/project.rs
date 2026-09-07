use crate::db::init::initialize_db;
use crate::models::frontmatter::DEFAULT_LANGUAGE;
use crate::models::project::ProjectMeta;
use std::fs;
use std::path::PathBuf;

/// Subdirectories every Sietch project owns.
const PROJECT_DIRS: [&str; 4] = ["chapters", "notes", "trash", ".sietch"];

/// Creates a new project at `{path}/{name}/`.
/// Generates the directory structure, `sietch.json`, and the SQLite database.
///
/// `language` is the language documents in this project are written in, and
/// seeds the frontmatter of every file created in it. The frontend passes the
/// app's own locale; a caller that has none gets `en`.
#[tauri::command]
pub fn create_project(
    name: String,
    path: String,
    language: Option<String>,
) -> Result<ProjectMeta, String> {
    let project_dir = PathBuf::from(&path).join(&name);

    // Create project directories
    for sub in PROJECT_DIRS {
        fs::create_dir_all(project_dir.join(sub))
            .map_err(|e| format!("Failed to create directory {sub}: {e}"))?;
    }

    // Create metadata
    let language = language.unwrap_or_else(|| DEFAULT_LANGUAGE.to_string());
    let mut meta = ProjectMeta::new(&name, &language);
    meta.save(&project_dir)?;

    // Initialize database
    let _conn = initialize_db(&project_dir)?;

    Ok(meta)
}

/// Opens an existing project by reading `sietch.json`.
/// Recreates missing directories and drops tree items whose file is gone.
///
/// `language` is the app's own locale, and is written into `sietch.json` when
/// the project predates the field. A project created before it had no answer
/// but the built-in default, so every chapter that filled in its frontmatter
/// was stamped `en` — Spanish manuscripts included.
#[tauri::command]
pub fn open_project(path: String, language: Option<String>) -> Result<ProjectMeta, String> {
    let project_dir = PathBuf::from(&path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    // Before retain_items, on purpose. The pruning below tolerates a file that
    // is missing right now; it is not a decision to forget the chapter, and a
    // save after it would make it one. The only open that writes is this one.
    if meta.language_missing {
        meta.language = language.unwrap_or_else(|| DEFAULT_LANGUAGE.to_string());
        meta.save(&project_dir)?;
    }

    // Recreate missing directories (tolerant validation)
    for sub in PROJECT_DIRS {
        let dir = project_dir.join(sub);
        if !dir.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| format!("Failed to recreate directory {sub}: {e}"))?;
        }
    }

    // Initialize database (idempotent — safe to call on every open)
    let _conn = initialize_db(&project_dir)?;

    // Only keep chapters whose .md file still exists. Folders are tree-only,
    // so there is nothing of theirs to go missing.
    let chapters_dir = project_dir.join("chapters");
    meta.retain_items(&|id| chapters_dir.join(format!("{id}.md")).exists());

    Ok(meta)
}

/// Changes the language new documents in this project are written in.
///
/// Only `sietch.json` is touched. Existing chapters keep the `language` in
/// their own frontmatter — rewriting a folder of files because a dropdown
/// changed is not something an editor should do behind the writer's back. A
/// chapter with no `language` entry catches up on its next save, through the
/// same `fill_missing_in` path everything else uses.
///
/// Hands back the stored tag rather than the whole meta. The frontend's copy
/// has a tree that `open_project` pruned in memory, and re-reading here would
/// put the orphans back in the sidebar.
#[tauri::command]
pub fn set_project_language(path: String, language: String) -> Result<String, String> {
    // ponytail: emptiness is the only thing actually unsafe — it is the sentinel
    // `load` reads as "absent", and every new file's frontmatter would then be
    // seeded blank. The tag itself is not this layer's to police: the picker
    // offers two, and a project someone wrote by hand in `fr` is a real project.
    let language = language.trim().to_string();
    if language.is_empty() {
        return Err("Project language cannot be empty.".into());
    }

    let project_dir = PathBuf::from(&path);
    let mut meta = ProjectMeta::load(&project_dir)?;
    meta.language = language.clone();
    meta.save(&project_dir)?;

    Ok(language)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::chapter::create_chapter;
    use std::path::Path;

    /// A real project on disk, plus its path. The guard has to stay bound or
    /// the directory is swept out from under the test.
    fn project(language: Option<&str>) -> (tempfile::TempDir, PathBuf, String) {
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project(
            "novel".into(),
            tmp.path().to_string_lossy().into_owned(),
            language.map(str::to_string),
        )
        .expect("create_project");

        let dir = tmp.path().join("novel");
        let path = dir.to_string_lossy().into_owned();
        (tmp, dir, path)
    }

    /// `sietch.json` as it was written before `language` existed. `tree` is
    /// whatever the caller wants in it.
    fn legacy_meta(dir: &Path, tree: &str) {
        fs::write(
            dir.join("sietch.json"),
            format!(
                r#"{{"name":"novel","author":"","created":"2025-01-01T00:00:00Z","modified":"2025-01-01T00:00:00Z","version":"1.0.0","tree":{tree}}}"#
            ),
        )
        .expect("legacy sietch.json");
    }

    fn slurp_meta(dir: &Path) -> String {
        fs::read_to_string(dir.join("sietch.json")).expect("slurp")
    }

    /// The bug. A project written before the field opens under a Spanish app
    /// and the guess is written down, so the chapters it seeds stop saying `en`.
    #[test]
    fn opening_a_project_without_a_language_writes_the_app_locale_to_disk() {
        let (_tmp, dir, path) = project(None);
        legacy_meta(&dir, "[]");

        let meta = open_project(path, Some("es".into())).expect("open_project");
        assert_eq!(meta.language, "es");
        assert_eq!(ProjectMeta::load(&dir).expect("reload").language, "es");
    }

    /// The `modified` regression. An ordinary open touches nothing — this is the
    /// test that fails if anyone reaches for an unconditional save().
    #[test]
    fn opening_a_project_that_has_a_language_leaves_the_file_alone() {
        let (_tmp, dir, path) = project(Some("es"));
        let before = slurp_meta(&dir);

        let meta = open_project(path, Some("en".into())).expect("open_project");
        assert_eq!(meta.language, "es", "the locale does not overwrite a choice");
        assert_eq!(slurp_meta(&dir), before, "byte for byte, modified included");
    }

    /// The backfill save runs before the pruning, so a file that is missing
    /// right now costs the writer a sidebar row and not the chapter.
    #[test]
    fn the_backfill_does_not_persist_the_orphan_pruning() {
        let (_tmp, dir, path) = project(None);
        legacy_meta(&dir, r#"[{"type":"item","id":"ghost","kind":"chapter"}]"#);

        let meta = open_project(path, Some("es".into())).expect("open_project");
        assert!(meta.tree.is_empty(), "the orphan is not shown");
        assert_eq!(ProjectMeta::load(&dir).expect("reload").language, "es");
        assert!(
            slurp_meta(&dir).contains("ghost"),
            "the orphan is still on disk, waiting for its file to come back"
        );
    }

    /// Changing the language is a decision about new documents. Rewriting a
    /// folder of files because a dropdown moved is not this command's business.
    #[test]
    fn changing_the_language_rewrites_no_chapter_file() {
        let (_tmp, dir, path) = project(Some("en"));
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");
        let chapter = dir.join("chapters").join(format!("{}.md", created.id));
        let before = fs::read_to_string(&chapter).expect("slurp");

        let stored = set_project_language(path.clone(), "  es  ".into()).expect("set");
        assert_eq!(stored, "es", "trimmed");
        assert_eq!(ProjectMeta::load(&dir).expect("reload").language, "es");
        assert_eq!(fs::read_to_string(&chapter).expect("slurp"), before);

        // The next one is written in the new language
        let next = create_chapter(path, "Chapter Two".into(), None).expect("create_chapter");
        let raw = fs::read_to_string(dir.join("chapters").join(format!("{}.md", next.id)))
            .expect("slurp");
        assert!(raw.contains("language: es"), "{raw}");
    }

    /// An empty tag is the sentinel `load` reads as "absent", so storing one
    /// would seed every new file's frontmatter blank.
    #[test]
    fn an_empty_language_is_refused() {
        let (_tmp, dir, path) = project(Some("es"));
        let before = slurp_meta(&dir);

        assert!(set_project_language(path, "   ".into()).is_err());
        assert_eq!(slurp_meta(&dir), before);
    }
}
