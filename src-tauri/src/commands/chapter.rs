use crate::models::frontmatter::{self, Frontmatter, TYPE_CHAPTER};
use crate::models::project::{
    ChapterContent, ChapterMeta, Node, ProjectMeta, TrashEntry, KIND_CHAPTER,
};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Chapter files are named by UUID (`chapters/{id}.md`) so renaming a chapter
/// never touches the tree. The human-readable title lives in the file's
/// frontmatter, and only there — the tree stores no chapter titles.
fn chapter_path(project_dir: &Path, id: &str) -> PathBuf {
    project_dir.join("chapters").join(format!("{id}.md"))
}

/// A trashed chapter keeps its name. The id is a UUID, so a file landing here
/// can never collide with one already in it.
fn trash_path(project_dir: &Path, id: &str) -> PathBuf {
    project_dir.join("trash").join(format!("{id}.md"))
}

/// Moves `chapters/{id}.md` into `trash/`, and says whether there was a file to
/// move. An id in the tree whose file is already gone is an orphan, which
/// `list_chapters` skips rather than fails on, so deleting one is not an error.
///
/// The file is moved, never read. A chapter whose frontmatter block is broken is
/// exactly the one someone wants out of the way, and every write path refuses
/// that file — parsing here would make it the one chapter nobody can delete.
pub fn trash_file(project_dir: &Path, id: &str) -> Result<bool, String> {
    let from = chapter_path(project_dir, id);
    if !from.exists() {
        return Ok(false);
    }

    // open_project recreates trash/ on the way in; this covers it being removed
    // from under a running app, the same way create_chapter covers chapters/.
    let trash_dir = project_dir.join("trash");
    fs::create_dir_all(&trash_dir).map_err(|e| format!("Failed to create trash directory: {e}"))?;

    fs::rename(&from, trash_path(project_dir, id))
        .map_err(|e| format!("Failed to move chapter to trash: {e}"))?;
    Ok(true)
}

// ponytail: recounted from the body on every read. Free here because listing
// already reads each file for its title. The word_counts table in db/init.rs
// takes over at F-024, when session history needs a stored series.
//
// Counts the markdown source, so syntax tokens have to be dropped or a heading
// reads one word longer here than in the editor, which counts rendered text.
// A token is a word when it holds a letter or a digit: `#`, `-`, `>` and `---`
// fall out, `**bold**` and `mind-killer` stay.
fn word_count(body: &str) -> usize {
    body.split_whitespace()
        .filter(|token| token.chars().any(|c| c.is_alphanumeric()))
        .count()
}

/// RFC3339 timestamp of a file's last modification.
fn modified_at(path: &Path) -> Result<String, String> {
    let mtime = fs::metadata(path)
        .and_then(|meta| meta.modified())
        .map_err(|e| format!("Failed to stat chapter file: {e}"))?;
    Ok(chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339())
}

fn read_raw(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read chapter file: {e}"))
}

fn write_raw(path: &Path, raw: &str) -> Result<(), String> {
    fs::write(path, raw).map_err(|e| format!("Failed to write chapter file: {e}"))
}

/// Builds the metadata the sidebar reads from a chapter's parsed file.
fn chapter_meta(id: &str, fm: Frontmatter, body: &str, path: &Path) -> Result<ChapterMeta, String> {
    Ok(ChapterMeta {
        id: id.to_string(),
        title: fm.title,
        doc_type: fm.doc_type,
        language: fm.language,
        tags: fm.tags,
        word_count: word_count(body),
        modified: modified_at(path)?,
    })
}

/// Lists every chapter in the project tree, skipping IDs whose file is missing.
#[tauri::command]
pub fn list_chapters(project_path: String) -> Result<Vec<ChapterMeta>, String> {
    let project_dir = PathBuf::from(&project_path);
    let meta = ProjectMeta::load(&project_dir)?;

    let chapter_ids = meta.item_ids(KIND_CHAPTER);
    let mut chapters = Vec::with_capacity(chapter_ids.len());
    for id in &chapter_ids {
        let path = chapter_path(&project_dir, id);
        // An orphaned ID skips the listing rather than failing it
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let (fm, body) = frontmatter::parse_or_default(&raw, id, &meta.language);
        chapters.push(chapter_meta(id, fm, body, &path)?);
    }
    Ok(chapters)
}

/// Creates an empty chapter inside `parent`, or at the root of the tree when no
/// folder is selected.
#[tauri::command]
pub fn create_chapter(
    project_path: String,
    title: String,
    parent: Option<String>,
) -> Result<ChapterMeta, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    let chapters_dir = project_dir.join("chapters");
    fs::create_dir_all(&chapters_dir)
        .map_err(|e| format!("Failed to create chapters directory: {e}"))?;

    let id = Uuid::new_v4().to_string();
    let fm = Frontmatter {
        id: id.clone(),
        doc_type: TYPE_CHAPTER.to_string(),
        language: meta.language.clone(),
        title,
        tags: Vec::new(),
    };

    let path = chapter_path(&project_dir, &id);
    write_raw(&path, &frontmatter::render(&fm, "")?)?;

    meta.insert(Node::chapter(id.as_str()), parent.as_deref());
    meta.save(&project_dir)?;

    chapter_meta(&id, fm, "", &path)
}

/// Reads a chapter's frontmatter and body separately. A file with no block, a
/// malformed one, or one written by another editor all open on defaults.
#[tauri::command]
pub fn read_chapter(project_path: String, id: String) -> Result<ChapterContent, String> {
    let project_dir = PathBuf::from(&project_path);
    let meta = ProjectMeta::load(&project_dir)?;

    let path = chapter_path(&project_dir, &id);
    let raw = read_raw(&path)?;
    let (fm, body) = frontmatter::parse_or_default(&raw, &id, &meta.language);

    Ok(ChapterContent {
        frontmatter: fm,
        body: body.to_string(),
    })
}

/// Writes a chapter's body, preserving the block above it byte for byte.
/// `content` is stored verbatim — this layer does not care whether it is
/// markdown, HTML, or anything else.
///
/// Refuses a file whose block is broken. The body in the editor is lost rather
/// than the block on disk, which is the cheaper of the two: the writer still
/// has their text on screen, and a block rebuilt over a broken one is gone.
#[tauri::command]
pub fn save_chapter(
    project_path: String,
    id: String,
    content: String,
) -> Result<ChapterMeta, String> {
    let project_dir = PathBuf::from(&project_path);
    let meta = ProjectMeta::load(&project_dir)?;
    let path = chapter_path(&project_dir, &id);

    // The editor only ever sends the body. The block is read back and spliced
    // around unchanged, so a field this version never heard of survives, and so
    // do comments and key order. A file that has no block gets one here — on
    // the first save, not on the read that noticed it was missing. A file whose
    // block is broken gets nothing: replace_body fails while the argument to
    // write_raw is still being built, so the write never runs.
    let raw = read_raw(&path)?;
    let (fm, _) = frontmatter::parse_or_default(&raw, &id, &meta.language);
    write_raw(&path, &frontmatter::replace_body(&raw, &fm, &content)?)?;

    chapter_meta(&id, fm, &content, &path)
}

/// Rewrites the title inside a chapter's frontmatter and leaves everything else
/// alone — the body, and every other entry in the block. The file is named by
/// UUID, so a rename never moves it and the tree never changes.
#[tauri::command]
pub fn rename_chapter(
    project_path: String,
    id: String,
    title: String,
) -> Result<ChapterMeta, String> {
    // The title is one line of frontmatter, so a newline would corrupt the file
    let title = title.trim().replace(['\n', '\r'], " ");
    if title.is_empty() {
        return Err("Chapter title cannot be empty.".into());
    }

    let project_dir = PathBuf::from(&project_path);
    let meta = ProjectMeta::load(&project_dir)?;
    let path = chapter_path(&project_dir, &id);
    let raw = read_raw(&path)?;

    // A broken block stops the rename here, before anything is written —
    // set_title_in would rebuild the block on top of the broken one
    let (block, body) = frontmatter::split(&raw)?;
    let (mut fm, _) = frontmatter::parse_or_default(&raw, &id, &meta.language);
    fm.title = title.clone();

    let updated = match block {
        Some(block) => format!(
            "---\n{}---\n\n{body}",
            frontmatter::set_title_in(block, &title)?
        ),
        None => frontmatter::render(&fm, body)?,
    };
    write_raw(&path, &updated)?;

    chapter_meta(&id, fm, body, &path)
}

/// Moves a chapter to `trash/` and drops it from the tree. Never a hard delete:
/// `trash/` is part of the project format, and `restore_chapter` is the way back.
///
/// The tree is checked first so a refusal writes nothing, which is the same
/// order `delete_folder` and `move_node` use.
#[tauri::command]
pub fn delete_chapter(project_path: String, id: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    if !matches!(meta.find(&id), Some(Node::Item { .. })) {
        return Err("Chapter not found.".into());
    }

    if trash_file(&project_dir, &id)? {
        meta.trash.push(TrashEntry {
            id: id.clone(),
            deleted: chrono::Utc::now().to_rfc3339(),
        });
    }
    meta.remove(&id);
    meta.save(&project_dir)?;

    Ok(())
}

/// Brings a chapter back from `trash/` and appends it to the root of the tree.
/// Where it used to sit is not recorded, so the writer moves it back themselves.
#[tauri::command]
pub fn restore_chapter(project_path: String, id: String) -> Result<ChapterMeta, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    let from = trash_path(&project_dir, &id);
    if !from.exists() {
        return Err("That chapter is not in the trash.".into());
    }

    // fs::rename overwrites the target on Unix and fails on Windows. Neither is
    // an answer for a file with a writer's manuscript in it, so this asks first.
    let to = chapter_path(&project_dir, &id);
    if to.exists() {
        return Err("A chapter with that id is already in the project.".into());
    }

    let chapters_dir = project_dir.join("chapters");
    fs::create_dir_all(&chapters_dir)
        .map_err(|e| format!("Failed to create chapters directory: {e}"))?;
    fs::rename(&from, &to).map_err(|e| format!("Failed to restore chapter: {e}"))?;

    meta.trash.retain(|entry| entry.id != id);
    meta.insert(Node::chapter(id.as_str()), None);
    meta.save(&project_dir)?;

    let raw = read_raw(&to)?;
    let (fm, body) = frontmatter::parse_or_default(&raw, &id, &meta.language);
    chapter_meta(&id, fm, body, &to)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::folder::create_folder;
    use crate::commands::project::create_project;

    /// A real project on disk, plus its path. The guard has to stay bound or
    /// the directory is swept out from under the test.
    fn project() -> (tempfile::TempDir, PathBuf, String) {
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project(
            "novel".into(),
            tmp.path().to_string_lossy().into_owned(),
            None,
        )
        .expect("create_project");

        let dir = tmp.path().join("novel");
        let path = dir.to_string_lossy().into_owned();
        (tmp, dir, path)
    }

    /// Replaces a chapter's file wholesale, standing in for another editor.
    fn overwrite(dir: &Path, id: &str, raw: &str) {
        fs::write(chapter_path(dir, id), raw).expect("overwrite");
    }

    fn slurp(dir: &Path, id: &str) -> String {
        fs::read_to_string(chapter_path(dir, id)).expect("slurp")
    }

    #[test]
    fn word_count_ignores_markdown_syntax() {
        // Each case is what the editor's own counter reports for the same text
        assert_eq!(word_count("# Chapter One"), 2);
        assert_eq!(word_count("**Hola**"), 1);
        assert_eq!(word_count("-   First beat"), 2);
        assert_eq!(word_count("> Fear is the mind-killer."), 4);
        assert_eq!(word_count("## A section\n\nSome **bold** text."), 5);
        assert_eq!(word_count("---"), 0);
        assert_eq!(word_count(""), 0);
    }

    #[test]
    fn chapter_roundtrip_preserves_title() {
        let (_tmp, dir, path) = project();

        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");
        assert!(Uuid::parse_str(&created.id).is_ok(), "id must be a UUID");
        assert_eq!(created.title, "Chapter One");
        assert_eq!(created.doc_type, TYPE_CHAPTER);
        assert_eq!(created.word_count, 0);

        let meta = ProjectMeta::load(&dir).expect("load");
        assert_eq!(meta.tree, vec![Node::chapter(created.id.as_str())]);

        let listed = list_chapters(path.clone()).expect("list_chapters");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "Chapter One");

        let body = "The spice must flow";
        let saved =
            save_chapter(path.clone(), created.id.clone(), body.into()).expect("save_chapter");
        assert_eq!(saved.word_count, 4);

        let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read.body, body, "body must survive the roundtrip verbatim");
        assert_eq!(read.frontmatter.id, created.id, "the id is the file's name");
        assert_eq!(read.frontmatter.doc_type, TYPE_CHAPTER);
        assert_eq!(read.frontmatter.language, "en");
        assert!(read.frontmatter.tags.is_empty());

        // The regression that matters: a body-only save must not clobber the block
        let relisted = list_chapters(path).expect("relist");
        assert_eq!(relisted[0].title, "Chapter One");
    }

    #[test]
    fn rename_rewrites_the_title_and_keeps_the_body() {
        let (_tmp, dir, path) = project();

        let created =
            create_chapter(path.clone(), "Untitled".into(), None).expect("create_chapter");
        let body = "# Dune\n\nThe spice must flow.";
        save_chapter(path.clone(), created.id.clone(), body.into()).expect("save_chapter");

        let renamed = rename_chapter(path.clone(), created.id.clone(), "Arrakis".into())
            .expect("rename_chapter");
        assert_eq!(renamed.title, "Arrakis");
        assert_eq!(renamed.word_count, 5, "renaming must not change the count");

        // The regression that matters: a rename must not touch the body
        let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read.body, body);

        // The file keeps its UUID name, so the tree is untouched
        let meta = ProjectMeta::load(&dir).expect("load");
        assert_eq!(meta.tree, vec![Node::chapter(created.id.as_str())]);
        let listed = list_chapters(path.clone()).expect("list_chapters");
        assert_eq!(listed[0].title, "Arrakis");

        // A blank title would leave a nameless row in the sidebar
        assert!(rename_chapter(path.clone(), created.id.clone(), "   ".into()).is_err());

        // A newline would break the one-line frontmatter and swallow the body
        let squashed = rename_chapter(path.clone(), created.id.clone(), "a\nb".into())
            .expect("rename_chapter");
        assert_eq!(squashed.title, "a b");
        assert_eq!(
            read_chapter(path, created.id).expect("read_chapter").body,
            body
        );
    }

    #[test]
    fn a_save_preserves_fields_this_editor_does_not_know() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        // pov and synopsis land in later tickets; the comment is a user's own
        overwrite(
            &dir,
            &created.id,
            "---\ntitle: Chapter One\npov: Paul\n# a note to self\nsynopsis: |\n  He wakes.\ntags:\n  - dune\n---\n\nOld body.\n",
        );

        save_chapter(path.clone(), created.id.clone(), "New body.".into()).expect("save_chapter");

        let raw = slurp(&dir, &created.id);
        assert!(
            raw.contains("pov: Paul"),
            "unknown field must survive: {raw}"
        );
        assert!(
            raw.contains("# a note to self"),
            "comment must survive: {raw}"
        );
        assert!(
            raw.contains("synopsis: |"),
            "block scalar must survive: {raw}"
        );
        assert!(raw.contains("New body."));
        assert!(!raw.contains("Old body."));

        // And the fields we do know still parse back out
        let read = read_chapter(path, created.id).expect("read_chapter");
        assert_eq!(read.frontmatter.title, "Chapter One");
        assert_eq!(read.frontmatter.tags, vec!["dune".to_string()]);
        assert_eq!(read.body, "New body.");
    }

    #[test]
    fn a_rename_preserves_fields_this_editor_does_not_know() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        overwrite(
            &dir,
            &created.id,
            "---\npov: Paul\ntitle: Chapter One\n# keep me\ntags:\n  - dune\n---\n\nThe body.\n",
        );

        rename_chapter(path.clone(), created.id.clone(), "Arrakis".into()).expect("rename_chapter");

        // The regression that matters: rename used to rebuild the whole block,
        // which deleted every entry but the title
        let raw = slurp(&dir, &created.id);
        assert!(
            raw.contains("pov: Paul"),
            "unknown field must survive: {raw}"
        );
        assert!(raw.contains("# keep me"), "comment must survive: {raw}");
        assert!(raw.contains("- dune"), "tags must survive: {raw}");
        assert!(raw.contains("title: Arrakis"));
        assert!(!raw.contains("title: Chapter One"));

        let read = read_chapter(path, created.id).expect("read_chapter");
        assert_eq!(read.frontmatter.title, "Arrakis");
        assert_eq!(
            read.body, "The body.\n",
            "the body is verbatim, newline and all"
        );
    }

    #[test]
    fn a_file_without_frontmatter_opens_on_defaults() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        overwrite(
            &dir,
            &created.id,
            "# Written elsewhere\n\nNo block at all.\n",
        );

        let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read.frontmatter.id, created.id, "id falls back to the file");
        assert_eq!(read.frontmatter.doc_type, TYPE_CHAPTER);
        assert_eq!(read.frontmatter.language, "en");
        assert!(read.frontmatter.tags.is_empty());
        assert_eq!(
            read.frontmatter.title, "Written elsewhere",
            "a UUID stem would read as noise, so the heading wins"
        );
        assert_eq!(read.body, "# Written elsewhere\n\nNo block at all.\n");

        // The block is written on the first save, not on the read
        assert!(!slurp(&dir, &created.id).starts_with("---"));
        save_chapter(path, created.id.clone(), "Now edited.".into()).expect("save_chapter");

        let raw = slurp(&dir, &created.id);
        assert!(raw.starts_with("---\n"), "the save writes the block: {raw}");
        assert!(raw.contains("title: Written elsewhere"));
        assert!(raw.contains(&format!("id: {}", created.id)));
    }

    #[test]
    fn broken_frontmatter_never_panics() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        // Every one of these has to read and list — a writer cannot repair a
        // file they cannot open. `saves` is false for the three that opened a
        // block and then broke it: a write would rebuild the block over the
        // broken one and leave the broken one in the manuscript as prose, which
        // no later repair undoes.
        let cases = [
            ("", true, "empty file"),
            ("---\ntitle: never closed\n\nbody", false, "unclosed block"),
            (
                "---\ntitle: [unbalanced\n---\n\nbody",
                false,
                "malformed YAML",
            ),
            (
                "---\ntitle: A\ntitle: B\n---\n\nbody",
                false,
                "duplicate key",
            ),
            ("---\npov: Paul\n---\n\nbody", true, "no known fields"),
            ("---\n---\n\nbody", true, "empty block"),
            (
                "---\n\nA rule, not a block.\n\n---\n\nMore prose.\n",
                true,
                "horizontal rules",
            ),
            (
                "---\n\nHe turned. She said: nothing.\nMore prose.\n\n---\n\nAnd on.\n",
                true,
                "a rule over prose that is not valid YAML",
            ),
        ];

        for (raw, saves, what) in cases {
            overwrite(&dir, &created.id, raw);

            let read = read_chapter(path.clone(), created.id.clone())
                .unwrap_or_else(|e| panic!("{what} must still open: {e}"));
            assert!(!read.frontmatter.id.is_empty(), "{what}: id must be filled");
            assert_eq!(read.frontmatter.doc_type, TYPE_CHAPTER, "{what}");
            assert_eq!(read.frontmatter.language, "en", "{what}");

            list_chapters(path.clone()).unwrap_or_else(|e| panic!("{what} must list: {e}"));

            let saved = save_chapter(path.clone(), created.id.clone(), "Edited.".into());
            if saves {
                saved.unwrap_or_else(|e| panic!("{what} must save: {e}"));
            } else {
                assert!(saved.is_err(), "{what} must refuse to save: {raw}");
                assert_eq!(
                    slurp(&dir, &created.id),
                    raw,
                    "{what}: a refused save must leave the file exactly as it was"
                );
            }
        }
    }

    #[test]
    fn a_broken_block_is_never_overwritten() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        // A block half-edited by hand: the flow sequence never closes, so the
        // block does not parse and the real metadata under it is unreadable
        let raw = "---\ntitle: [Chapter One\npov: Paul\ntags:\n  - dune\n---\n\nThe body.\n";
        overwrite(&dir, &created.id, raw);

        // The chapter still opens, on defaults, with the whole file as body —
        // the writer has to be able to see what broke
        let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read.body, raw, "nothing may be eaten");

        // The regression that matters: the autosave that follows must not write
        // a second block on top of this one and leave this one in the manuscript
        let err = save_chapter(path.clone(), created.id.clone(), "Edited.".into())
            .expect_err("a broken block must refuse the save");
        // Coupled to the wording on purpose. Nothing in the app can repair the
        // file, so the sentence telling the writer to do it is the fix.
        assert!(
            err.contains("text editor"),
            "the error must say what to do about it: {err}"
        );
        // The statusbar hangs this off a tooltip. serde-saphyr renders a caret
        // diagram under its message by default, which is three lines of ASCII in
        // one — `crop_radius: 0` in split is what keeps this to a sentence.
        assert!(!err.contains('\n'), "the error must fit a tooltip: {err}");
        assert_eq!(
            slurp(&dir, &created.id),
            raw,
            "a refused save must leave the file byte for byte what it was"
        );

        // A rename goes through the same block and refuses on the same grounds
        assert!(rename_chapter(path.clone(), created.id.clone(), "Arrakis".into()).is_err());
        assert_eq!(
            slurp(&dir, &created.id),
            raw,
            "and so must a refused rename"
        );

        // Repaired by hand, the chapter writes again — the refusal is a state of
        // the file, not one the chapter gets stuck in
        overwrite(
            &dir,
            &created.id,
            "---\ntitle: Chapter One\npov: Paul\ntags:\n  - dune\n---\n\nThe body.\n",
        );
        save_chapter(path, created.id.clone(), "Edited.".into()).expect("a repaired block saves");
        let fixed = slurp(&dir, &created.id);
        assert!(fixed.contains("pov: Paul"), "{fixed}");
        assert!(fixed.contains("Edited."), "{fixed}");
    }

    #[test]
    fn a_horizontal_rule_is_not_a_frontmatter_delimiter() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        // A rule mid-body is the common case, and must not be read as a closing
        // delimiter for a block that opened above it
        let body = "First scene.\n\n---\n\nSecond scene.";
        save_chapter(path.clone(), created.id.clone(), body.into()).expect("save_chapter");

        let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read.body, body);
        assert_eq!(read.frontmatter.title, "Chapter One");

        // A file that opens on a rule is all body: the text between the rules is
        // not a YAML mapping, so it is prose, not metadata
        overwrite(&dir, &created.id, "---\n\nA rule.\n\n---\n\nProse.\n");
        let read = read_chapter(path, created.id).expect("read_chapter");
        assert!(
            read.body.starts_with("---"),
            "nothing may be eaten: {:?}",
            read.body
        );
        assert!(read.body.contains("A rule."));
    }

    #[test]
    fn a_title_with_yaml_punctuation_survives() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");
        save_chapter(path.clone(), created.id.clone(), "The body.".into()).expect("save_chapter");

        // A bare `title: El despertar: parte 2` is not valid YAML
        for title in ["El despertar: parte 2", "# Uno", "\"quoted\"", "- dash"] {
            let renamed = rename_chapter(path.clone(), created.id.clone(), title.into())
                .expect("rename_chapter");
            assert_eq!(renamed.title, title);

            let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
            assert_eq!(
                read.frontmatter.title,
                title,
                "in {:?}",
                slurp(&dir, &created.id)
            );
            assert_eq!(read.body, "The body.");
        }
    }

    #[test]
    fn a_block_written_with_crlf_is_recognised() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        // Obsidian on Windows writes these, and the promise is that files stay portable
        overwrite(
            &dir,
            &created.id,
            "---\r\ntitle: Desde Windows\r\npov: Paul\r\n---\r\n\r\nEl cuerpo.\r\n",
        );

        let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read.frontmatter.title, "Desde Windows");
        assert!(read.body.starts_with("El cuerpo."));

        save_chapter(path, created.id.clone(), "Editado.".into()).expect("save_chapter");
        assert!(slurp(&dir, &created.id).contains("pov: Paul"));
    }

    #[test]
    fn a_project_written_before_this_ticket_opens_and_catches_up() {
        use crate::commands::project::open_project;

        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        // sietch.json as it was written before format_version and language existed
        fs::write(
            dir.join("sietch.json"),
            format!(
                r#"{{"name":"novel","author":"","created":"2025-01-01T00:00:00Z","modified":"2025-01-01T00:00:00Z","version":"1.0.0","tree":[{{"type":"item","id":"{}","kind":"chapter"}}]}}"#,
                created.id
            ),
        )
        .expect("legacy sietch.json");

        // And a chapter file as it was written then: one field, nothing else
        overwrite(
            &dir,
            &created.id,
            "---\ntitle: Chapter One\n---\n\nThe body.\n",
        );

        // The app is in Spanish, and so is the manuscript. Before SIE-80 the
        // locale never reached here and the chapter below was stamped `en`.
        let meta = open_project(path.clone(), Some("es".into()))
            .expect("a missing format_version is format 1");
        assert_eq!(meta.format_version, 1);
        assert_eq!(meta.language, "es");
        assert_eq!(
            ProjectMeta::load(&dir).expect("reload").language,
            "es",
            "the backfill reaches the file, not just this process"
        );

        let read = read_chapter(path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read.frontmatter.title, "Chapter One");
        assert_eq!(read.frontmatter.id, created.id);
        assert_eq!(read.frontmatter.doc_type, TYPE_CHAPTER);

        // The file catches up on its first save, without losing what it had
        save_chapter(path, created.id.clone(), "Edited.".into()).expect("save_chapter");
        let raw = slurp(&dir, &created.id);
        assert!(raw.contains("title: Chapter One"), "{raw}");
        assert!(raw.contains(&format!("id: {}", created.id)), "{raw}");
        assert!(raw.contains("type: chapter"), "{raw}");
        assert!(raw.contains("language: es"), "{raw}");
        assert!(raw.contains("tags: []"), "{raw}");
        assert!(raw.contains("Edited."), "{raw}");
    }

    #[test]
    fn a_created_chapter_reads_back() {
        let (_tmp, dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");

        let raw = slurp(&dir, &created.id);
        assert!(raw.starts_with("---\n"), "{raw}");
        assert!(raw.contains(&format!("id: {}", created.id)));
        assert!(raw.contains("type: chapter"));
        assert!(raw.contains("language: en"));
        assert!(raw.contains("title: Chapter One"));
        assert!(raw.contains("tags: []"));

        let read = read_chapter(path, created.id.clone()).expect("read_chapter");
        assert_eq!(read.frontmatter.id, created.id);
        assert_eq!(read.frontmatter.doc_type, TYPE_CHAPTER);
        assert_eq!(read.frontmatter.title, "Chapter One");
        assert_eq!(read.body, "");
    }

    #[test]
    fn a_deleted_chapter_moves_to_trash() {
        let (_tmp, dir, path) = project();

        let chapter = create_chapter(path.clone(), "One".into(), None).expect("chapter");
        overwrite(&dir, &chapter.id, "---\ntitle: One\n---\n\nThe sleeper must awaken.\n");

        delete_chapter(path.clone(), chapter.id.clone()).expect("delete_chapter");

        assert!(!chapter_path(&dir, &chapter.id).exists());
        let trashed = trash_path(&dir, &chapter.id);
        assert!(trashed.exists());
        assert!(
            fs::read_to_string(&trashed)
                .expect("read")
                .contains("The sleeper must awaken."),
            "the file is moved, not rewritten"
        );

        let meta = ProjectMeta::load(&dir).expect("load");
        assert!(meta.find(&chapter.id).is_none());
        assert_eq!(meta.trash.len(), 1);
        assert_eq!(meta.trash[0].id, chapter.id);
        assert!(chrono::DateTime::parse_from_rfc3339(&meta.trash[0].deleted).is_ok());

        assert!(
            delete_chapter(path, chapter.id).is_err(),
            "gone is gone"
        );
    }

    #[test]
    fn a_chapter_with_a_broken_block_still_deletes() {
        let (_tmp, dir, path) = project();

        // A block that opens and never closes. Every write path refuses this
        // file, so it is the one most likely to be on its way out.
        let chapter = create_chapter(path.clone(), "Broken".into(), None).expect("chapter");
        overwrite(&dir, &chapter.id, "---\ntitle: Broken\n\nno closing fence\n");
        assert!(
            rename_chapter(path.clone(), chapter.id.clone(), "Fixed".into()).is_err(),
            "the writers refuse it"
        );

        delete_chapter(path, chapter.id.clone()).expect("delete_chapter");
        assert!(trash_path(&dir, &chapter.id).exists());
    }

    #[test]
    fn an_orphaned_id_deletes_without_a_trash_entry() {
        let (_tmp, dir, path) = project();

        let chapter = create_chapter(path.clone(), "One".into(), None).expect("chapter");
        fs::remove_file(chapter_path(&dir, &chapter.id)).expect("remove");

        delete_chapter(path, chapter.id.clone()).expect("delete_chapter");

        let meta = ProjectMeta::load(&dir).expect("load");
        assert!(meta.find(&chapter.id).is_none(), "the node still goes");
        assert!(meta.trash.is_empty(), "nothing was moved, so nothing is dated");
        assert!(!trash_path(&dir, &chapter.id).exists());
    }

    #[test]
    fn a_restored_chapter_comes_back_to_the_root() {
        let (_tmp, dir, path) = project();

        let part = create_folder(path.clone(), "Part One".into(), None).expect("folder");
        let chapter =
            create_chapter(path.clone(), "One".into(), Some(part.id().into())).expect("chapter");
        delete_chapter(path.clone(), chapter.id.clone()).expect("delete_chapter");

        let back = restore_chapter(path.clone(), chapter.id.clone()).expect("restore_chapter");
        assert_eq!(back.title, "One");
        assert!(chapter_path(&dir, &chapter.id).exists());
        assert!(!trash_path(&dir, &chapter.id).exists());

        // At the root, not back inside the folder — where it sat is not recorded
        let meta = ProjectMeta::load(&dir).expect("load");
        assert_eq!(meta.tree.last(), Some(&Node::chapter(chapter.id.as_str())));
        assert!(meta.trash.is_empty());

        assert!(
            restore_chapter(path, chapter.id).is_err(),
            "the trash is empty now"
        );
    }

    #[test]
    fn a_restore_never_writes_over_a_chapter_that_is_there() {
        let (_tmp, dir, path) = project();

        let chapter = create_chapter(path.clone(), "One".into(), None).expect("chapter");
        delete_chapter(path.clone(), chapter.id.clone()).expect("delete_chapter");

        // Another editor puts a file back at the same id while it sits in trash
        overwrite(&dir, &chapter.id, "---\ntitle: Rewritten\n---\n\nKeep me.\n");

        assert!(restore_chapter(path, chapter.id.clone()).is_err());
        assert!(slurp(&dir, &chapter.id).contains("Keep me."));
        assert!(trash_path(&dir, &chapter.id).exists(), "still recoverable");
    }

    #[test]
    fn a_refused_delete_leaves_sietch_json_alone() {
        let (_tmp, dir, path) = project();
        create_chapter(path.clone(), "One".into(), None).expect("chapter");

        let before = fs::read_to_string(dir.join("sietch.json")).expect("read");
        assert!(delete_chapter(path.clone(), "not-an-id".into()).is_err());
        assert!(restore_chapter(path, "not-an-id".into()).is_err());
        assert_eq!(
            fs::read_to_string(dir.join("sietch.json")).expect("read"),
            before
        );
    }
}
