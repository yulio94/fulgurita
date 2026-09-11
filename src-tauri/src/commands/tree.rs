use crate::models::project::ProjectMeta;
use std::path::PathBuf;

/// Moves a node to a new place in the tree.
///
/// `parent` is the folder it lands in, or the root when `None`. `before` is the
/// sibling it lands in front of, or the end of that folder when `None`. An
/// anchor rather than an index on purpose: `open_project` prunes chapters whose
/// file is missing from the copy it hands the frontend but leaves them in
/// `fulgurita.json`, so the two trees legitimately differ and the same position
/// would not name the same gap on both sides. An id names one node in either.
#[tauri::command]
pub fn move_node(
    project_path: String,
    id: String,
    parent: Option<String>,
    before: Option<String>,
) -> Result<(), String> {
    let project_dir = PathBuf::from(&project_path);
    let mut meta = ProjectMeta::load(&project_dir)?;

    meta.move_node(&id, parent.as_deref(), before.as_deref())?;
    meta.save(&project_dir)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::chapter::{create_chapter, list_chapters};
    use crate::commands::folder::create_folder;
    use crate::commands::project::create_project;
    use crate::models::project::Node;
    use std::fs;

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

    fn listed(path: &str) -> Vec<String> {
        list_chapters(path.to_string())
            .expect("list_chapters")
            .into_iter()
            .map(|c| c.id)
            .collect()
    }

    #[test]
    fn a_reordered_chapter_lists_in_its_new_order_and_survives_a_reload() {
        let (_tmp, path) = project();
        let one = create_chapter(path.clone(), "One".into(), None).expect("chapter");
        let two = create_chapter(path.clone(), "Two".into(), None).expect("chapter");
        let three = create_chapter(path.clone(), "Three".into(), None).expect("chapter");

        move_node(path.clone(), three.id.clone(), None, Some(one.id.clone())).expect("move");

        assert_eq!(
            listed(&path),
            vec![three.id.clone(), one.id.clone(), two.id.clone()]
        );

        // The order is on disk, not just in the listing
        let meta = ProjectMeta::load(&PathBuf::from(&path)).expect("load");
        assert_eq!(
            meta.tree,
            vec![
                Node::chapter(&three.id),
                Node::chapter(&one.id),
                Node::chapter(&two.id),
            ]
        );
    }

    #[test]
    fn a_chapter_moves_into_a_folder_and_back_out() {
        let (_tmp, path) = project();
        let loose = create_chapter(path.clone(), "Loose".into(), None).expect("chapter");
        let part = create_folder(path.clone(), "Part One".into(), None).expect("folder");

        move_node(path.clone(), loose.id.clone(), Some(part.id().into()), None).expect("in");
        let meta = ProjectMeta::load(&PathBuf::from(&path)).expect("load");
        assert_eq!(
            meta.tree,
            vec![Node::Folder {
                id: part.id().into(),
                title: "Part One".into(),
                children: vec![Node::chapter(&loose.id)],
            }]
        );

        move_node(path.clone(), loose.id.clone(), None, None).expect("out");
        let meta = ProjectMeta::load(&PathBuf::from(&path)).expect("load");
        assert_eq!(
            meta.tree,
            vec![Node::folder(part.id(), "Part One"), Node::chapter(&loose.id)]
        );
    }

    #[test]
    fn a_refused_move_leaves_fulgurita_json_alone() {
        let (_tmp, path) = project();
        let outer = create_folder(path.clone(), "Outer".into(), None).expect("folder");
        let inner =
            create_folder(path.clone(), "Inner".into(), Some(outer.id().into())).expect("folder");

        let manifest = PathBuf::from(&path).join("fulgurita.json");
        let before = fs::read_to_string(&manifest).expect("read");

        move_node(path.clone(), outer.id().into(), Some(inner.id().into()), None)
            .expect_err("a folder cannot hold its own parent");
        move_node(path.clone(), "nope".into(), None, None).expect_err("unknown id");

        // No save ran, so not even `modified` moved
        assert_eq!(fs::read_to_string(&manifest).expect("read"), before);
    }
}
