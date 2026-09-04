mod commands;
mod db;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::create_project,
            commands::project::open_project,
            commands::chapter::list_chapters,
            commands::chapter::create_chapter,
            commands::chapter::read_chapter,
            commands::chapter::save_chapter,
            commands::chapter::rename_chapter,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
