use crate::commands::chapter::chapter_path;
use crate::db::init::initialize_db;
use crate::models::frontmatter::DEFAULT_LANGUAGE;
use crate::models::project::ProjectMeta;
use std::fs;
use std::path::PathBuf;

/// Subdirectories every Fulgurita project owns.
const PROJECT_DIRS: [&str; 4] = ["chapters", "notes", "trash", ".fulgurita"];

/// Creates a new project at `{path}/{name}/`.
/// Generates the directory structure, `fulgurita.json`, and the SQLite database.
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

/// Opens an existing project by reading `fulgurita.json`.
/// Recreates missing directories and drops tree items whose file is gone.
///
/// `language` is the app's own locale, and is written into `fulgurita.json` when
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
    // so there is nothing of theirs to go missing. An id that is not a valid
    // file name has no file either, and goes the same way.
    meta.retain_items(&|id| chapter_path(&project_dir, id).is_ok_and(|p| p.exists()));

    Ok(meta)
}

/// Changes the language new documents in this project are written in.
///
/// Only `fulgurita.json` is touched. Existing chapters keep the `language` in
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

/// Changes what kind of writing this project holds.
///
/// Only `fulgurita.json` is touched, and nothing is migrated: the fields a
/// document already carries stay where they are. The frontmatter is an open
/// mapping and a key from a previous type is ignored, not deleted.
///
/// The name is not checked against the four the picker offers, for the reason
/// the language above is not checked against its two: a project someone typed a
/// type into by hand is a real project, and F-082 is meant to add its own.
///
/// Hands back the stored value rather than the whole meta, the same way
/// `set_project_language` does — see the note there.
#[tauri::command]
pub fn set_project_type(path: String, project_type: String) -> Result<String, String> {
    // Empty is the one value that is not a name. `load` reads it as absent and
    // supplies `novel`, so storing it would mean the picker and the file
    // disagree about what the writer just chose.
    let project_type = project_type.trim().to_string();
    if project_type.is_empty() {
        return Err("Project type cannot be empty.".into());
    }

    let project_dir = PathBuf::from(&path);
    let mut meta = ProjectMeta::load(&project_dir)?;
    meta.project_type = project_type.clone();
    meta.save(&project_dir)?;

    Ok(project_type)
}

/// Stores the color a tag is drawn in, project-wide. An empty `color` removes
/// the entry: "no entry" is already how an untouched tag reads, so one command
/// covers both setting a color and putting one back to the default.
///
/// The palette name is not checked. The Inspector is the only writer and it
/// sends from a fixed list, and a name someone hand-edited into `fulgurita.json`
/// is handled where every other tolerant read is — the chip matches no rule and
/// keeps the default styling.
#[tauri::command]
pub fn set_tag_color(project_path: String, tag: String, color: String) -> Result<(), String> {
    let tag = tag.trim().to_string();
    if tag.is_empty() {
        return Err("Tag cannot be empty.".into());
    }

    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    let color = color.trim();
    if color.is_empty() {
        meta.tag_colors.remove(&tag);
    } else {
        meta.tag_colors.insert(tag, color.to_string());
    }
    meta.save(&project_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::chapter::{create_chapter, delete_chapter, set_chapter_tags};
    use crate::models::project::PROJECT_TYPE_NOVEL;
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

    /// `fulgurita.json` as it was written before `language` existed. `tree` is
    /// whatever the caller wants in it.
    fn legacy_meta(dir: &Path, tree: &str) {
        fs::write(
            dir.join("fulgurita.json"),
            format!(
                r#"{{"name":"novel","author":"","created":"2025-01-01T00:00:00Z","modified":"2025-01-01T00:00:00Z","version":"1.0.0","tree":{tree}}}"#
            ),
        )
        .expect("legacy fulgurita.json");
    }

    fn slurp_meta(dir: &Path) -> String {
        fs::read_to_string(dir.join("fulgurita.json")).expect("slurp")
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
        assert_eq!(
            meta.language, "es",
            "the locale does not overwrite a choice"
        );
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

    /// The invariant the ticket leads with: a project written before the field
    /// behaves exactly as it did, and opening one writes nothing. Absent
    /// `project_type` is not lossy the way absent `language` was — it already
    /// means novel — so there is no backfill here to churn the file.
    #[test]
    fn a_project_written_before_project_type_opens_as_a_novel_and_is_not_rewritten() {
        let (_tmp, dir, path) = project(Some("es"));
        // Language present, so the one backfill there is stays out of the way.
        let raw = slurp_meta(&dir);
        let stripped = raw
            .lines()
            .filter(|line| !line.contains("\"project_type\""))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!stripped.contains("project_type"), "{stripped}");
        fs::write(dir.join("fulgurita.json"), &stripped).expect("write");

        let meta = open_project(path, Some("es".into())).expect("open_project");
        assert_eq!(meta.project_type, PROJECT_TYPE_NOVEL);
        assert_eq!(
            slurp_meta(&dir),
            stripped,
            "an open writes nothing — byte for byte, modified included"
        );
    }

    /// The test that fails the moment someone reaches for an enum or a list of
    /// the four names the picker offers. A type this version has never heard of
    /// is stored, handed back, and still there after an unrelated save.
    #[test]
    fn an_unknown_project_type_survives_a_save() {
        let (_tmp, dir, path) = project(Some("en"));
        set_project_type(path.clone(), "pocket-zine".into()).expect("set");

        set_project_language(path, "es".into()).expect("set_project_language");
        assert_eq!(
            ProjectMeta::load(&dir).expect("reload").project_type,
            "pocket-zine"
        );
    }

    /// Changing the type is a decision about what this project is, not an
    /// instruction to migrate it. Empty is refused for the reason it is on the
    /// language: `load` reads it as absent.
    #[test]
    fn changing_the_type_rewrites_no_chapter_file_and_an_empty_type_is_refused() {
        let (_tmp, dir, path) = project(Some("en"));
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");
        let chapter = dir.join("chapters").join(format!("{}.md", created.id));
        let before = fs::read_to_string(&chapter).expect("slurp");

        let stored = set_project_type(path.clone(), "  thesis  ".into()).expect("set");
        assert_eq!(stored, "thesis", "trimmed");
        assert_eq!(ProjectMeta::load(&dir).expect("reload").project_type, "thesis");
        assert_eq!(fs::read_to_string(&chapter).expect("slurp"), before);

        let untouched = slurp_meta(&dir);
        assert!(set_project_type(path, "   ".into()).is_err());
        assert_eq!(slurp_meta(&dir), untouched);
    }

    /// A hand edit can leave the key there and blank, which serde's default
    /// does not cover. Same answer as absent.
    #[test]
    fn a_blank_project_type_on_disk_reads_as_a_novel() {
        let (_tmp, dir, _path) = project(Some("en"));
        let raw = slurp_meta(&dir).replace(r#""project_type": "novel""#, r#""project_type": """#);
        assert!(raw.contains(r#""project_type": """#), "{raw}");
        fs::write(dir.join("fulgurita.json"), raw).expect("write");

        assert_eq!(
            ProjectMeta::load(&dir).expect("load").project_type,
            PROJECT_TYPE_NOVEL
        );
    }

    #[test]
    fn a_tag_color_is_stored_and_an_empty_color_removes_it() {
        let (_tmp, dir, path) = project(None);

        set_tag_color(path.clone(), "harbour".into(), "water".into()).expect("set_tag_color");
        assert_eq!(
            ProjectMeta::load(&dir)
                .expect("load")
                .tag_colors
                .get("harbour"),
            Some(&"water".to_string())
        );

        // Same command puts the tag back to the default styling
        set_tag_color(path, "harbour".into(), "".into()).expect("set_tag_color");
        assert!(ProjectMeta::load(&dir).expect("load").tag_colors.is_empty());
    }

    /// Nothing prunes the map. A writer who re-adds the tag next week gets
    /// their color back, which is worth more than the bytes.
    #[test]
    fn a_tag_color_outlives_the_chapter_that_used_it() {
        let (_tmp, dir, path) = project(None);
        let created = create_chapter(path.clone(), "One".into(), None).expect("create_chapter");

        set_chapter_tags(path.clone(), created.id.clone(), vec!["harbour".into()])
            .expect("set_chapter_tags");
        set_tag_color(path.clone(), "harbour".into(), "water".into()).expect("set_tag_color");
        delete_chapter(path, created.id).expect("delete_chapter");

        assert_eq!(
            ProjectMeta::load(&dir)
                .expect("load")
                .tag_colors
                .get("harbour"),
            Some(&"water".to_string())
        );
    }
}
