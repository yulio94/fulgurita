use crate::models::project::{ChapterMeta, Node, ProjectMeta, KIND_CHAPTER};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Chapter files are named by UUID (`chapters/{id}.md`) so renaming a chapter
/// never touches the tree. The human-readable title lives in the file's
/// frontmatter instead.
fn chapter_path(project_dir: &Path, id: &str) -> PathBuf {
    project_dir.join("chapters").join(format!("{id}.md"))
}

/// Splits a chapter file into its title and body. A file without frontmatter is
/// treated as all body with an empty title, so hand-written `.md` files still open.
fn split_frontmatter(raw: &str) -> (String, String) {
    let Some(rest) = raw.strip_prefix("---\n") else {
        return (String::new(), raw.to_string());
    };
    let Some((front, body)) = rest.split_once("\n---\n") else {
        return (String::new(), raw.to_string());
    };
    let title = front
        .lines()
        .find_map(|line| line.strip_prefix("title:"))
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    (title, body.trim_start_matches('\n').to_string())
}

/// Renders a chapter file from its title and body.
fn render_chapter(title: &str, body: &str) -> String {
    format!("---\ntitle: {title}\n---\n\n{body}")
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
        let (title, body) = split_frontmatter(&raw);
        chapters.push(ChapterMeta {
            id: id.clone(),
            title,
            word_count: word_count(&body),
            modified: modified_at(&path)?,
        });
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
    let path = chapter_path(&project_dir, &id);
    fs::write(&path, render_chapter(&title, ""))
        .map_err(|e| format!("Failed to write chapter file: {e}"))?;

    meta.insert(Node::chapter(id.as_str()), parent.as_deref());
    meta.save(&project_dir)?;

    Ok(ChapterMeta {
        id,
        title,
        word_count: 0,
        modified: modified_at(&path)?,
    })
}

/// Reads a chapter's body. The frontmatter is stripped — callers already hold
/// the title from `list_chapters`.
#[tauri::command]
pub fn read_chapter(project_path: String, id: String) -> Result<String, String> {
    let path = chapter_path(&PathBuf::from(&project_path), &id);
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read chapter file: {e}"))?;
    Ok(split_frontmatter(&raw).1)
}

/// Writes a chapter's body, preserving the title already on disk.
/// `content` is stored verbatim — this layer does not care whether it is
/// markdown, HTML, or anything else.
#[tauri::command]
pub fn save_chapter(
    project_path: String,
    id: String,
    content: String,
) -> Result<ChapterMeta, String> {
    let path = chapter_path(&PathBuf::from(&project_path), &id);

    // The editor only ever sends the body, so the title has to be read back
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read chapter file: {e}"))?;
    let (title, _) = split_frontmatter(&raw);

    fs::write(&path, render_chapter(&title, &content))
        .map_err(|e| format!("Failed to write chapter file: {e}"))?;

    Ok(ChapterMeta {
        id,
        title,
        word_count: word_count(&content),
        modified: modified_at(&path)?,
    })
}

/// Rewrites a chapter's frontmatter title and leaves the body alone. The file is
/// named by UUID, so a rename never moves it and the tree never changes.
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

    let path = chapter_path(&PathBuf::from(&project_path), &id);
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read chapter file: {e}"))?;
    let (_, body) = split_frontmatter(&raw);

    fs::write(&path, render_chapter(&title, &body))
        .map_err(|e| format!("Failed to write chapter file: {e}"))?;

    Ok(ChapterMeta {
        id,
        word_count: word_count(&body),
        title,
        modified: modified_at(&path)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::project::create_project;

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
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project("novel".into(), tmp.path().to_string_lossy().into_owned())
            .expect("create_project");

        let project_dir = tmp.path().join("novel");
        let project_path = project_dir.to_string_lossy().into_owned();

        let created = create_chapter(project_path.clone(), "Chapter One".into(), None)
            .expect("create_chapter");
        assert!(Uuid::parse_str(&created.id).is_ok(), "id must be a UUID");
        assert_eq!(created.title, "Chapter One");
        assert_eq!(created.word_count, 0);

        let meta = ProjectMeta::load(&project_dir).expect("load");
        assert_eq!(meta.tree, vec![Node::chapter(created.id.as_str())]);

        let listed = list_chapters(project_path.clone()).expect("list_chapters");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "Chapter One");

        let body = "The spice must flow";
        let saved = save_chapter(project_path.clone(), created.id.clone(), body.into())
            .expect("save_chapter");
        assert_eq!(saved.word_count, 4);

        let read = read_chapter(project_path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read, body, "body must survive the roundtrip verbatim");

        // The regression that matters: a body-only save must not clobber the title
        let relisted = list_chapters(project_path).expect("relist");
        assert_eq!(relisted[0].title, "Chapter One");
    }

    #[test]
    fn rename_rewrites_the_title_and_keeps_the_body() {
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project("novel".into(), tmp.path().to_string_lossy().into_owned())
            .expect("create_project");

        let project_dir = tmp.path().join("novel");
        let project_path = project_dir.to_string_lossy().into_owned();

        let created =
            create_chapter(project_path.clone(), "Untitled".into(), None).expect("create_chapter");
        let body = "# Dune\n\nThe spice must flow.";
        save_chapter(project_path.clone(), created.id.clone(), body.into()).expect("save_chapter");

        let renamed = rename_chapter(project_path.clone(), created.id.clone(), "Arrakis".into())
            .expect("rename_chapter");
        assert_eq!(renamed.title, "Arrakis");
        assert_eq!(renamed.word_count, 5, "renaming must not change the count");

        // The regression that matters: a rename must not touch the body
        let read = read_chapter(project_path.clone(), created.id.clone()).expect("read_chapter");
        assert_eq!(read, body);

        // The file keeps its UUID name, so the tree is untouched
        let meta = ProjectMeta::load(&project_dir).expect("load");
        assert_eq!(meta.tree, vec![Node::chapter(created.id.as_str())]);
        let listed = list_chapters(project_path.clone()).expect("list_chapters");
        assert_eq!(listed[0].title, "Arrakis");

        // A blank title would leave a nameless row in the sidebar
        assert!(rename_chapter(project_path.clone(), created.id.clone(), "   ".into()).is_err());

        // A newline would break the one-line frontmatter and swallow the body
        let squashed = rename_chapter(project_path.clone(), created.id.clone(), "a\nb".into())
            .expect("rename_chapter");
        assert_eq!(squashed.title, "a b");
        assert_eq!(
            read_chapter(project_path, created.id).expect("read_chapter"),
            body
        );
    }
}
