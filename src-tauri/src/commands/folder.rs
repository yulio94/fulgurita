use crate::commands::chapter::trash_file;
use crate::models::project::{item_ids_in, Node, ProjectMeta, TrashEntry, KIND_CHAPTER};
use std::path::PathBuf;
use uuid::Uuid;

/// A folder title lives in `fulgurita.json`, so the only rule is that it reads as
/// something. A chapter title needs more care: it is one line of frontmatter.
fn clean_title(title: &str) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Folder title cannot be empty.".into());
    }
    Ok(title.to_string())
}

/// Creates an empty folder inside `parent`, or at the root of the tree.
/// Returns the node itself, which is what the sidebar splices into the tree it
/// already holds.
#[tauri::command]
pub fn create_folder(
    project_path: String,
    title: String,
    parent: Option<String>,
) -> Result<Node, String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    let node = Node::folder(Uuid::new_v4().to_string(), clean_title(&title)?);
    meta.insert(node.clone(), parent.as_deref());
    meta.save(&project_dir)?;

    Ok(node)
}

/// Renames a folder and hands back the stored title, which is trimmed.
#[tauri::command]
pub fn rename_folder(project_path: String, id: String, title: String) -> Result<String, String> {
    let title = clean_title(&title)?;
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    if !meta.rename_folder(&id, &title) {
        return Err("Folder not found.".into());
    }
    meta.save(&project_dir)?;

    Ok(title)
}

/// Deletes a folder and everything under it. A folder owns no file, so only the
/// chapters nested inside it go to `trash/` — at any depth, and by the same
/// one-way move `delete_chapter` makes.
///
/// The frontend confirms first and names the count. This takes more than the row
/// that was clicked, so it is the one delete that asks.
#[tauri::command]
pub fn delete_folder(project_path: String, id: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    if !matches!(meta.find(&id), Some(Node::Folder { .. })) {
        return Err("Folder not found.".into());
    }

    // Detaching first hands back the subtree to walk. Nothing is on disk yet:
    // the manifest only changes at `save`, below.
    let removed = meta.remove(&id).ok_or("Folder not found.")?;

    // ponytail: a rename that fails partway leaves the chapters before it in
    // trash/ and returns before `save`, so fulgurita.json still lists them. They
    // read as orphans — which list_chapters already skips and open_project
    // already prunes — and restore_chapter brings any of them back. A rollback
    // would be the alternative, and nothing has been lost to roll back from.
    for chapter in item_ids_in(std::slice::from_ref(&removed), KIND_CHAPTER) {
        if trash_file(&project_dir, &chapter)? {
            meta.trash.push(TrashEntry {
                id: chapter,
                deleted: chrono::Utc::now().to_rfc3339(),
            });
        }
    }

    meta.save(&project_dir)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::chapter::{create_chapter, list_chapters};
    use crate::commands::project::create_project;

    fn project() -> (tempfile::TempDir, String) {
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project(
            "novel".into(),
            tmp.path().to_string_lossy().into_owned(),
            None,
        )
        .expect("create_project");
        let path = tmp.path().join("novel").to_string_lossy().into_owned();
        (tmp, path)
    }

    #[test]
    fn a_chapter_created_inside_a_folder_lists_in_tree_order() {
        let (_tmp, path) = project();

        let loose = create_chapter(path.clone(), "Loose".into(), None).expect("chapter");
        let part = create_folder(path.clone(), "  Part One  ".into(), None).expect("folder");
        assert_eq!(
            part,
            Node::folder(part.id(), "Part One"),
            "title is trimmed"
        );

        let nested =
            create_chapter(path.clone(), "Nested".into(), Some(part.id().into())).expect("chapter");

        // Depth-first: the folder comes second, so its chapter does too
        let listed = list_chapters(path.clone()).expect("list_chapters");
        assert_eq!(
            listed.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec![loose.id.as_str(), nested.id.as_str()]
        );

        // And it survives the reload — the nesting is on disk, not in memory
        let meta = ProjectMeta::load(&PathBuf::from(&path)).expect("load");
        assert_eq!(
            meta.find(part.id()),
            Some(&Node::Folder {
                id: part.id().into(),
                title: "Part One".into(),
                children: vec![Node::chapter(nested.id.as_str())],
            })
        );
    }

    #[test]
    fn an_empty_folder_deletes_without_touching_trash() {
        let (_tmp, path) = project();
        let dir = PathBuf::from(&path);

        let part = create_folder(path.clone(), "Part One".into(), None).expect("folder");
        delete_folder(path.clone(), part.id().into()).expect("delete_folder");

        let meta = ProjectMeta::load(&dir).expect("load");
        assert!(meta.find(part.id()).is_none());
        assert!(meta.trash.is_empty(), "a folder owns no file");
        assert!(
            delete_folder(path, part.id().into()).is_err(),
            "gone is gone"
        );
    }

    #[test]
    fn deleting_a_folder_takes_its_chapters_to_trash() {
        let (_tmp, path) = project();
        let dir = PathBuf::from(&path);

        // A chapter outside the folder, one directly inside it, and one nested a
        // level deeper — only the last two should move.
        let loose = create_chapter(path.clone(), "Loose".into(), None).expect("chapter");
        let part = create_folder(path.clone(), "Part One".into(), None).expect("folder");
        let inside =
            create_chapter(path.clone(), "Inside".into(), Some(part.id().into())).expect("chapter");
        let act = create_folder(path.clone(), "Act Two".into(), Some(part.id().into()))
            .expect("folder");
        let deeper =
            create_chapter(path.clone(), "Deeper".into(), Some(act.id().into())).expect("chapter");

        delete_folder(path.clone(), part.id().into()).expect("delete_folder");

        let meta = ProjectMeta::load(&dir).expect("load");
        assert!(meta.find(part.id()).is_none(), "the subtree is gone");
        assert!(meta.find(act.id()).is_none(), "the nested folder too");
        assert!(meta.find(&loose.id).is_some(), "the loose chapter stays");

        for id in [&inside.id, &deeper.id] {
            assert!(!dir.join("chapters").join(format!("{id}.md")).exists());
            assert!(dir.join("trash").join(format!("{id}.md")).exists());
        }
        assert!(dir
            .join("chapters")
            .join(format!("{}.md", loose.id))
            .exists());

        let trashed: Vec<&str> = meta.trash.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(trashed, vec![inside.id.as_str(), deeper.id.as_str()]);

        // Only the chapters listed, and each one dated
        assert!(meta
            .trash
            .iter()
            .all(|e| chrono::DateTime::parse_from_rfc3339(&e.deleted).is_ok()));
    }

    #[test]
    fn a_folder_needs_a_title() {
        let (_tmp, path) = project();
        assert!(create_folder(path.clone(), "   ".into(), None).is_err());

        let part = create_folder(path.clone(), "Part One".into(), None).expect("folder");
        assert!(rename_folder(path.clone(), part.id().into(), "\t".into()).is_err());
        assert_eq!(
            rename_folder(path, part.id().into(), " Act Two ".into()).expect("rename"),
            "Act Two"
        );
    }
}
