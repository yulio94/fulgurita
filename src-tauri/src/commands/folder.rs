use crate::models::project::{Node, ProjectMeta};
use std::path::PathBuf;
use uuid::Uuid;

/// A folder title lives in `sietch.json`, so the only rule is that it reads as
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

/// Deletes an empty folder. A folder owns no file, so nothing goes to `trash/`
/// — and deleting one with chapters inside would take them along, which is
/// F-020's call to make, not this one's.
#[tauri::command]
pub fn delete_folder(project_path: String, id: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    match meta.find(&id) {
        Some(Node::Folder { children, .. }) if children.is_empty() => {}
        Some(Node::Folder { .. }) => return Err("Only an empty folder can be deleted.".into()),
        _ => return Err("Folder not found.".into()),
    }

    meta.remove(&id);
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
    fn only_an_empty_folder_can_be_deleted() {
        let (_tmp, path) = project();

        let part = create_folder(path.clone(), "Part One".into(), None).expect("folder");
        let chapter =
            create_chapter(path.clone(), "One".into(), Some(part.id().into())).expect("chapter");
        assert!(delete_folder(path.clone(), part.id().into()).is_err());

        // Emptying it is enough — the chapter file is untouched either way
        let mut meta = ProjectMeta::load(&PathBuf::from(&path)).expect("load");
        meta.remove(&chapter.id);
        meta.save(&PathBuf::from(&path)).expect("save");

        delete_folder(path.clone(), part.id().into()).expect("delete_folder");
        assert!(ProjectMeta::load(&PathBuf::from(&path))
            .expect("load")
            .find(part.id())
            .is_none());
        assert!(
            delete_folder(path, part.id().into()).is_err(),
            "gone is gone"
        );
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
