use crate::models::project::{ChapterMeta, ProjectMeta};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Chapter files are named by UUID (`chapters/{id}.md`) so renaming a chapter
/// never touches `chapter_order`. The human-readable title lives in the file's
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
fn word_count(body: &str) -> usize {
    body.split_whitespace().count()
}

/// RFC3339 timestamp of a file's last modification.
fn modified_at(path: &Path) -> Result<String, String> {
    let mtime = fs::metadata(path)
        .and_then(|meta| meta.modified())
        .map_err(|e| format!("Failed to stat chapter file: {e}"))?;
    Ok(chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339())
}

/// Lists every chapter in `chapter_order`, skipping IDs whose file is missing.
#[tauri::command]
pub fn list_chapters(project_path: String) -> Result<Vec<ChapterMeta>, String> {
    let project_dir = PathBuf::from(&project_path);
    let meta = ProjectMeta::load(&project_dir)?;

    let mut chapters = Vec::with_capacity(meta.chapter_order.len());
    for id in &meta.chapter_order {
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

/// Creates an empty chapter and appends it to `chapter_order`.
#[tauri::command]
pub fn create_chapter(project_path: String, title: String) -> Result<ChapterMeta, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    let chapters_dir = project_dir.join("chapters");
    fs::create_dir_all(&chapters_dir)
        .map_err(|e| format!("Failed to create chapters directory: {e}"))?;

    let id = Uuid::new_v4().to_string();
    let path = chapter_path(&project_dir, &id);
    fs::write(&path, render_chapter(&title, ""))
        .map_err(|e| format!("Failed to write chapter file: {e}"))?;

    meta.chapter_order.push(id.clone());
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::project::create_project;

    #[test]
    fn chapter_roundtrip_preserves_title() {
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project("novel".into(), tmp.path().to_string_lossy().into_owned())
            .expect("create_project");

        let project_dir = tmp.path().join("novel");
        let project_path = project_dir.to_string_lossy().into_owned();

        let created =
            create_chapter(project_path.clone(), "Chapter One".into()).expect("create_chapter");
        assert!(Uuid::parse_str(&created.id).is_ok(), "id must be a UUID");
        assert_eq!(created.title, "Chapter One");
        assert_eq!(created.word_count, 0);

        let meta = ProjectMeta::load(&project_dir).expect("load");
        assert_eq!(meta.chapter_order, vec![created.id.clone()]);

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
}
