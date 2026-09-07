use crate::models::frontmatter::{Frontmatter, DEFAULT_LANGUAGE};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// The only leaf kind today. Characters (F-089), notes (F-023) and encyclopædia
/// entries (F-060) become further kinds in the same tree.
pub const KIND_CHAPTER: &str = "chapter";

/// On-disk layout of a project. Bumped when the shape of the files changes,
/// not when the app version does.
pub const FORMAT_VERSION: u32 = 1;

fn default_format_version() -> u32 {
    FORMAT_VERSION
}

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

/// Puts `node` before the sibling `before`, or last when it is `None` or names
/// nothing here. A caller that dropped onto the gap after the last row means the
/// end, and so does one whose anchor has since gone.
fn insert_before(nodes: &mut Vec<Node>, node: Node, before: Option<&str>) {
    match before.and_then(|anchor| nodes.iter().position(|node| node.id() == anchor)) {
        Some(index) => nodes.insert(index, node),
        None => nodes.push(node),
    }
}

/// Inserts `node` inside `parent`, before the sibling `before`. Hands the node
/// back when no such folder exists, so the caller can fall back to the root —
/// the same contract as `insert_in`.
fn insert_at_in(
    nodes: &mut [Node],
    mut node: Node,
    parent: &str,
    before: Option<&str>,
) -> Option<Node> {
    for candidate in nodes.iter_mut() {
        if let Node::Folder { id, children, .. } = candidate {
            if id == parent {
                insert_before(children, node, before);
                return None;
            }
            match insert_at_in(children, node, parent, before) {
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

/// Whether `id` sits somewhere inside `node`. A node does not contain itself.
fn contains(node: &Node, id: &str) -> bool {
    match node {
        Node::Folder { children, .. } => find_in(children, id).is_some(),
        Node::Item { .. } => false,
    }
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
    /// A project written before this field existed is format 1, so opening one
    /// reads as an upgrade of nothing rather than a failure.
    #[serde(default = "default_format_version")]
    pub format_version: u32,
    /// The language new documents are written in. A file's own frontmatter
    /// overrides it. Empty on disk means absent: `load` fills it in and says so
    /// through `language_missing`.
    #[serde(default)]
    pub language: String,
    /// True when `load` had to supply `language`. Never written to disk, never
    /// on the IPC payload — it is one open's worth of knowledge, for
    /// `open_project`, which is the only caller that has a better answer.
    #[serde(skip)]
    pub language_missing: bool,
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
    pub fn new(name: &str, language: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            name: name.to_string(),
            author: String::new(),
            created: now.clone(),
            modified: now,
            version: "1.0.0".to_string(),
            format_version: FORMAT_VERSION,
            language: language.to_string(),
            language_missing: false,
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

        // Every other caller reads `language` — chapter.rs and folder.rs load a
        // meta just to seed frontmatter — so it never leaves here empty. Only
        // open_project, which has the app's locale, gets to know it was a fill.
        meta.language_missing = meta.language.is_empty();
        if meta.language_missing {
            meta.language = DEFAULT_LANGUAGE.to_string();
        }

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

    /// Moves `id` inside `parent`, before the sibling `before`, or to the end of
    /// that folder when `before` is `None` or names nothing there. A `parent` of
    /// `None`, or one naming a folder that is gone, means the root — the same
    /// fallback `insert` makes.
    ///
    /// The result is a permutation of the nodes already in the tree, so the only
    /// ways this fails are an id that is not there and a folder asked to hold
    /// itself. Both are checked before anything moves: `remove` detaches the
    /// subtree, and a parent inside it would have nowhere left to go.
    pub fn move_node(
        &mut self,
        id: &str,
        parent: Option<&str>,
        before: Option<&str>,
    ) -> Result<(), String> {
        let node = self
            .find(id)
            .ok_or_else(|| format!("No node with id {id}"))?;
        if parent == Some(id) || parent.is_some_and(|parent| contains(node, parent)) {
            return Err(format!("Cannot move {id} inside itself"));
        }
        if before == Some(id) {
            return Err(format!("Cannot move {id} before itself"));
        }

        let node = self
            .remove(id)
            .ok_or_else(|| format!("No node with id {id}"))?;
        let node = match parent {
            Some(parent) => match insert_at_in(&mut self.tree, node, parent, before) {
                None => return Ok(()),
                Some(back) => back,
            },
            None => node,
        };
        insert_before(&mut self.tree, node, before);
        Ok(())
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
    #[serde(rename = "type")]
    pub doc_type: String,
    pub language: String,
    pub tags: Vec<String>,
    pub word_count: usize,
    pub modified: String,
}

/// A chapter file split in two. The editor is handed both, but only ever sends
/// the body back — the block stays on disk and is spliced around, never rebuilt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterContent {
    pub frontmatter: Frontmatter,
    pub body: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::frontmatter::Frontmatter;

    /// The frontend reads these keys by name off the IPC payload, so a rename
    /// here is a silent break there. `type` in particular is not the field name.
    #[test]
    fn the_ipc_payload_keeps_the_names_the_frontend_reads() {
        let meta = ChapterMeta {
            id: "abc".into(),
            title: "Chapter One".into(),
            doc_type: KIND_CHAPTER.into(),
            language: "es".into(),
            tags: vec!["dune".into()],
            word_count: 4,
            modified: "2026-09-04T00:00:00Z".into(),
        };
        let json = serde_json::to_value(&meta).expect("serialize");
        assert_eq!(json["type"], "chapter", "doc_type crosses IPC as `type`");
        assert_eq!(json["word_count"], 4, "snake_case, not camelCase");
        assert_eq!(json["tags"][0], "dune");
        assert_eq!(json["language"], "es");

        let content = ChapterContent {
            frontmatter: Frontmatter {
                id: "abc".into(),
                doc_type: KIND_CHAPTER.into(),
                language: "es".into(),
                title: "Chapter One".into(),
                tags: Vec::new(),
            },
            body: "The spice.".into(),
        };
        let json = serde_json::to_value(&content).expect("serialize");
        assert_eq!(json["frontmatter"]["type"], "chapter");
        assert_eq!(json["body"], "The spice.");

        let project = ProjectMeta::new("novel", "es");
        let json = serde_json::to_value(&project).expect("serialize");
        assert_eq!(json["format_version"], 1);
        assert_eq!(json["language"], "es");
    }

    /// `load` is the only place that knows the difference between a project
    /// that says `en` and one that says nothing. Everyone else — chapter.rs and
    /// folder.rs, seeding frontmatter — must get a usable tag either way.
    #[test]
    fn a_missing_language_is_filled_but_flagged() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let legacy = r#"{"name":"novel","author":"","created":"2025-01-01T00:00:00Z","modified":"2025-01-01T00:00:00Z","version":"1.0.0"}"#;
        fs::write(tmp.path().join("sietch.json"), legacy).expect("write");

        let meta = ProjectMeta::load(tmp.path()).expect("load");
        assert_eq!(meta.language, DEFAULT_LANGUAGE, "never handed back empty");
        assert!(meta.language_missing, "the file said nothing");

        let present = r#"{"name":"novel","author":"","created":"2025-01-01T00:00:00Z","modified":"2025-01-01T00:00:00Z","version":"1.0.0","language":"en"}"#;
        fs::write(tmp.path().join("sietch.json"), present).expect("write");
        let meta = ProjectMeta::load(tmp.path()).expect("load");
        assert!(!meta.language_missing, "an explicit `en` is not a fill");

        // The flag is one open's worth of knowledge. It belongs on neither the
        // file nor the IPC payload the frontend deserializes.
        let json = serde_json::to_value(&meta).expect("serialize");
        assert!(json.get("language_missing").is_none(), "{json}");
    }

    fn sample() -> ProjectMeta {
        let mut meta = ProjectMeta::new("novel", DEFAULT_LANGUAGE);
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

    /// The tree as one line, so a move reads as a before and an after. Folders
    /// always carry their parentheses, so an empty one is not an item.
    fn shape(nodes: &[Node]) -> String {
        nodes
            .iter()
            .map(|node| match node {
                Node::Folder { id, children, .. } => format!("{id}({})", shape(children)),
                Node::Item { id, .. } => id.clone(),
            })
            .collect::<Vec<_>>()
            .join(",")
    }

    #[test]
    fn a_node_reorders_among_its_siblings_in_both_directions() {
        let mut meta = sample();
        assert_eq!(shape(&meta.tree), "f1(c1,f2(c2)),c3");

        // Backwards past a sibling: the anchor sits at 0 only once c3 is out.
        meta.move_node("c3", None, Some("f1")).expect("move c3 up");
        assert_eq!(shape(&meta.tree), "c3,f1(c1,f2(c2))");

        // And forwards again, with no anchor, which means last.
        meta.move_node("c3", None, None).expect("move c3 down");
        assert_eq!(shape(&meta.tree), "f1(c1,f2(c2)),c3");
    }

    #[test]
    fn a_leaf_moves_into_a_folder_and_back_out_to_the_root() {
        let mut meta = sample();
        meta.move_node("c3", Some("f2"), None).expect("into f2");
        assert_eq!(shape(&meta.tree), "f1(c1,f2(c2,c3))");

        meta.move_node("c3", Some("f1"), Some("c1")).expect("into f1");
        assert_eq!(shape(&meta.tree), "f1(c3,c1,f2(c2))");

        meta.move_node("c3", None, None).expect("out to the root");
        assert_eq!(shape(&meta.tree), "f1(c1,f2(c2)),c3");
    }

    #[test]
    fn a_folder_takes_its_children_with_it() {
        let mut meta = sample();
        meta.move_node("f2", None, Some("f1")).expect("f2 to the root");
        assert_eq!(shape(&meta.tree), "f2(c2),f1(c1),c3");
    }

    #[test]
    fn a_missing_anchor_appends_and_a_missing_parent_falls_back_to_the_root() {
        let mut meta = sample();
        meta.move_node("c3", Some("f1"), Some("gone")).expect("append in f1");
        assert_eq!(shape(&meta.tree), "f1(c1,f2(c2),c3)");

        let mut meta = sample();
        meta.move_node("c1", Some("gone"), None).expect("fall back to the root");
        assert_eq!(shape(&meta.tree), "f1(f2(c2)),c3,c1");
    }

    #[test]
    fn a_folder_cannot_be_moved_inside_itself_and_the_tree_survives_the_refusal() {
        let mut meta = sample();
        let before = shape(&meta.tree);

        assert!(meta.move_node("f1", Some("f1"), None).is_err(), "into itself");
        assert!(meta.move_node("f1", Some("f2"), None).is_err(), "into its folder");
        assert!(meta.move_node("f1", Some("c1"), None).is_err(), "into its leaf");

        // The guard runs before `remove`, so a refusal is not a detached subtree.
        assert_eq!(shape(&meta.tree), before);
    }

    #[test]
    fn an_unknown_id_and_a_move_before_itself_are_refused() {
        let mut meta = sample();
        let before = shape(&meta.tree);

        assert!(meta.move_node("nope", None, None).is_err());
        // Not a no-op if it were let through: the anchor goes with the removal
        // and the node would silently land last.
        assert!(meta.move_node("c3", None, Some("c3")).is_err());

        assert_eq!(shape(&meta.tree), before);
    }
}
