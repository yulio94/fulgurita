use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// The only leaf kind today. Characters (F-089), notes (F-023) and encyclopædia
/// entries (F-060) become further kinds in the same tree.
pub const KIND_CHAPTER: &str = "chapter";

fn default_kind() -> String {
    KIND_CHAPTER.to_string()
}

/// A node of the project tree, as stored in `sietch.json`.
///
/// Folders are categories: they hold any kind of leaf and carry no file of their
/// own. A leaf carries its `kind`, so a new kind of file is a new value here
/// rather than a second tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Node {
    Folder {
        id: String,
        title: String,
        #[serde(default)]
        children: Vec<Node>,
    },
    Item {
        id: String,
        #[serde(default = "default_kind")]
        kind: String,
    },
}

impl Node {
    pub fn id(&self) -> &str {
        match self {
            Node::Folder { id, .. } | Node::Item { id, .. } => id,
        }
    }

    pub fn chapter(id: impl Into<String>) -> Self {
        Node::Item {
            id: id.into(),
            kind: default_kind(),
        }
    }

    pub fn folder(id: impl Into<String>, title: impl Into<String>) -> Self {
        Node::Folder {
            id: id.into(),
            title: title.into(),
            children: Vec::new(),
        }
    }
}

/// Appends `node` under the folder `parent`. Hands the node back untouched when
/// no such folder exists, so the caller can fall back to the root.
fn insert_in(nodes: &mut [Node], mut node: Node, parent: &str) -> Option<Node> {
    for candidate in nodes.iter_mut() {
        if let Node::Folder { id, children, .. } = candidate {
            if id == parent {
                children.push(node);
                return None;
            }
            match insert_in(children, node, parent) {
                None => return None,
                Some(back) => node = back,
            }
        }
    }
    Some(node)
}

fn remove_in(nodes: &mut Vec<Node>, id: &str) -> Option<Node> {
    if let Some(index) = nodes.iter().position(|node| node.id() == id) {
        return Some(nodes.remove(index));
    }
    for node in nodes.iter_mut() {
        if let Node::Folder { children, .. } = node {
            if let Some(removed) = remove_in(children, id) {
                return Some(removed);
            }
        }
    }
    None
}

fn find_in<'a>(nodes: &'a [Node], id: &str) -> Option<&'a Node> {
    for node in nodes {
        if node.id() == id {
            return Some(node);
        }
        if let Node::Folder { children, .. } = node {
            if let Some(found) = find_in(children, id) {
                return Some(found);
            }
        }
    }
    None
}

fn rename_in(nodes: &mut [Node], id: &str, new_title: &str) -> bool {
    for node in nodes.iter_mut() {
        if let Node::Folder {
            id: folder_id,
            title,
            children,
        } = node
        {
            if folder_id == id {
                *title = new_title.to_string();
                return true;
            }
            if rename_in(children, id, new_title) {
                return true;
            }
        }
    }
    false
}

fn collect_ids(nodes: &[Node], kind: &str, out: &mut Vec<String>) {
    for node in nodes {
        match node {
            Node::Folder { children, .. } => collect_ids(children, kind, out),
            Node::Item { id, kind: k } if k == kind => out.push(id.clone()),
            Node::Item { .. } => {}
        }
    }
}

fn retain_in(nodes: &mut Vec<Node>, keep: &dyn Fn(&str) -> bool) {
    nodes.retain(|node| match node {
        Node::Item { id, .. } => keep(id),
        Node::Folder { .. } => true,
    });
    for node in nodes.iter_mut() {
        if let Node::Folder { children, .. } = node {
            retain_in(children, keep);
        }
    }
}

/// Project metadata serialized in `sietch.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub name: String,
    pub author: String,
    pub created: String,
    pub modified: String,
    pub version: String,
    /// The project structure, and its order. Nothing mirrors it.
    #[serde(default)]
    pub tree: Vec<Node>,
    /// Projects written before the tree stored a flat `chapter_order`. `load`
    /// lifts it into `tree` and it is never written back, so the next save
    /// leaves only the new shape.
    #[serde(default, skip_serializing)]
    chapter_order: Vec<String>,
}

impl ProjectMeta {
    /// Creates a new project with default values.
    pub fn new(name: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            name: name.to_string(),
            author: String::new(),
            created: now.clone(),
            modified: now,
            version: "1.0.0".to_string(),
            tree: Vec::new(),
            chapter_order: Vec::new(),
        }
    }

    /// Reads `sietch.json` from a project directory.
    pub fn load(project_dir: &Path) -> Result<Self, String> {
        let meta_path = project_dir.join("sietch.json");
        if !meta_path.exists() {
            return Err("sietch.json not found — this folder is not a Sietch project.".into());
        }
        let raw = fs::read_to_string(&meta_path)
            .map_err(|e| format!("Failed to read sietch.json: {e}"))?;
        let mut meta: Self =
            serde_json::from_str(&raw).map_err(|e| format!("Failed to parse sietch.json: {e}"))?;

        // A project that already has a tree keeps it — a leftover chapter_order
        // would otherwise resurrect chapters that were moved or removed
        if meta.tree.is_empty() {
            meta.tree = meta
                .chapter_order
                .iter()
                .map(|id| Node::chapter(id.as_str()))
                .collect();
        }
        meta.chapter_order.clear();

        Ok(meta)
    }

    /// Writes `sietch.json` to a project directory, stamping `modified`.
    pub fn save(&mut self, project_dir: &Path) -> Result<(), String> {
        self.modified = chrono::Utc::now().to_rfc3339();
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize metadata: {e}"))?;
        fs::write(project_dir.join("sietch.json"), json)
            .map_err(|e| format!("Failed to write sietch.json: {e}"))
    }

    /// Every item id of `kind`, depth-first, in tree order.
    pub fn item_ids(&self, kind: &str) -> Vec<String> {
        let mut ids = Vec::new();
        collect_ids(&self.tree, kind, &mut ids);
        ids
    }

    /// Appends `node` inside `parent`, or at the root when `parent` is `None` or
    /// names a folder that is gone.
    pub fn insert(&mut self, node: Node, parent: Option<&str>) {
        let node = match parent {
            Some(parent) => match insert_in(&mut self.tree, node, parent) {
                None => return,
                Some(back) => back,
            },
            None => node,
        };
        self.tree.push(node);
    }

    pub fn find(&self, id: &str) -> Option<&Node> {
        find_in(&self.tree, id)
    }

    pub fn remove(&mut self, id: &str) -> Option<Node> {
        remove_in(&mut self.tree, id)
    }

    /// Renames a folder. Chapters are renamed through their frontmatter instead.
    pub fn rename_folder(&mut self, id: &str, title: &str) -> bool {
        rename_in(&mut self.tree, id, title)
    }

    /// Drops the item nodes `keep` rejects. Folders always stay: they have no
    /// file that could go missing.
    pub fn retain_items(&mut self, keep: &dyn Fn(&str) -> bool) {
        retain_in(&mut self.tree, keep);
    }
}

/// Metadata for a single chapter, derived from its `.md` file on disk.
/// Never persisted as a unit — `list_chapters` rebuilds it on every call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterMeta {
    pub id: String,
    pub title: String,
    pub word_count: usize,
    pub modified: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> ProjectMeta {
        let mut meta = ProjectMeta::new("novel");
        meta.insert(Node::folder("f1", "Part One"), None);
        meta.insert(Node::chapter("c1"), Some("f1"));
        meta.insert(Node::folder("f2", "Act Two"), Some("f1"));
        meta.insert(Node::chapter("c2"), Some("f2"));
        meta.insert(Node::chapter("c3"), None);
        meta
    }

    #[test]
    fn chapter_order_migrates_into_the_tree() {
        let raw = r#"{"name":"novel","author":"","created":"t","modified":"t",
            "version":"1.0.0","chapter_order":["a","b"]}"#;
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(tmp.path().join("sietch.json"), raw).expect("write");

        let mut meta = ProjectMeta::load(tmp.path()).expect("load");
        assert_eq!(meta.tree, vec![Node::chapter("a"), Node::chapter("b")]);

        // The legacy key is not written back, and the tree survives the reload
        meta.save(tmp.path()).expect("save");
        let written = fs::read_to_string(tmp.path().join("sietch.json")).expect("read");
        assert!(!written.contains("chapter_order"));
        assert_eq!(
            ProjectMeta::load(tmp.path()).expect("reload").tree,
            meta.tree
        );
    }

    #[test]
    fn a_tree_wins_over_a_leftover_chapter_order() {
        let raw = r#"{"name":"novel","author":"","created":"t","modified":"t",
            "version":"1.0.0","chapter_order":["gone"],
            "tree":[{"type":"item","id":"a","kind":"chapter"}]}"#;
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(tmp.path().join("sietch.json"), raw).expect("write");

        let meta = ProjectMeta::load(tmp.path()).expect("load");
        assert_eq!(meta.tree, vec![Node::chapter("a")]);
    }

    #[test]
    fn item_ids_walk_the_tree_depth_first() {
        let meta = sample();
        assert_eq!(meta.item_ids(KIND_CHAPTER), vec!["c1", "c2", "c3"]);
        assert!(meta.item_ids("character").is_empty());
    }

    #[test]
    fn insert_falls_back_to_the_root_when_the_parent_is_gone() {
        let mut meta = sample();
        meta.insert(Node::chapter("c4"), Some("nope"));
        assert_eq!(meta.item_ids(KIND_CHAPTER), vec!["c1", "c2", "c3", "c4"]);
        assert!(matches!(meta.tree.last(), Some(node) if node.id() == "c4"));
    }

    #[test]
    fn retain_items_prunes_chapters_and_keeps_empty_folders() {
        let mut meta = sample();
        meta.retain_items(&|id| id != "c2");
        assert_eq!(meta.item_ids(KIND_CHAPTER), vec!["c1", "c3"]);
        assert!(
            meta.find("f2").is_some(),
            "an empty folder is not an orphan"
        );
    }

    #[test]
    fn remove_and_rename_reach_nested_nodes() {
        let mut meta = sample();
        assert!(meta.rename_folder("f2", "Act Three"));
        assert!(!meta.rename_folder("c1", "not a folder"));
        assert_eq!(
            meta.find("f2"),
            Some(&Node::Folder {
                id: "f2".into(),
                title: "Act Three".into(),
                children: vec![Node::chapter("c2")],
            })
        );

        assert_eq!(meta.remove("c2"), Some(Node::chapter("c2")));
        assert!(meta.find("c2").is_none());
        assert!(meta.remove("c2").is_none());
    }
}
