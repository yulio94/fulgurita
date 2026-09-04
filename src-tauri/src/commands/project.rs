use crate::db::init::initialize_db;
use crate::models::project::ProjectMeta;
use std::fs;
use std::path::PathBuf;

/// Subdirectories every Sietch project owns.
const PROJECT_DIRS: [&str; 4] = ["chapters", "notes", "trash", ".sietch"];

/// Creates a new project at `{path}/{name}/`.
/// Generates the directory structure, `sietch.json`, and the SQLite database.
#[tauri::command]
pub fn create_project(name: String, path: String) -> Result<ProjectMeta, String> {
    let project_dir = PathBuf::from(&path).join(&name);

    // Create project directories
    for sub in PROJECT_DIRS {
        fs::create_dir_all(project_dir.join(sub))
            .map_err(|e| format!("Failed to create directory {sub}: {e}"))?;
    }

    // Create metadata
    let mut meta = ProjectMeta::new(&name);
    meta.save(&project_dir)?;

    // Initialize database
    let _conn = initialize_db(&project_dir)?;

    Ok(meta)
}

/// Opens an existing project by reading `sietch.json`.
/// Recreates missing directories and cleans `chapter_order` for orphaned IDs.
#[tauri::command]
pub fn open_project(path: String) -> Result<ProjectMeta, String> {
    let project_dir = PathBuf::from(&path);
    let mut meta = ProjectMeta::load(&project_dir)?;

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

    // Clean chapter_order: only keep IDs whose .md file exists in chapters/
    let chapters_dir = project_dir.join("chapters");
    meta.chapter_order
        .retain(|id| chapters_dir.join(format!("{id}.md")).exists());

    Ok(meta)
}
