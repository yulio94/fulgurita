use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Project metadata serialized in `sietch.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub name: String,
    pub author: String,
    pub created: String,
    pub modified: String,
    pub version: String,
    pub chapter_order: Vec<String>,
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
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse sietch.json: {e}"))
    }

    /// Writes `sietch.json` to a project directory, stamping `modified`.
    pub fn save(&mut self, project_dir: &Path) -> Result<(), String> {
        self.modified = chrono::Utc::now().to_rfc3339();
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize metadata: {e}"))?;
        fs::write(project_dir.join("sietch.json"), json)
            .map_err(|e| format!("Failed to write sietch.json: {e}"))
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
