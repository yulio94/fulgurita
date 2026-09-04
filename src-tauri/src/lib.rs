mod commands;
mod db;
mod models;

use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::Manager;

/// Our stand-in for the predefined Quit item.
const QUIT_MENU_ID: &str = "sietch-quit";

/// Cmd+Q runs NSApplication terminate:, which tears the process down without ever
/// sending windowShouldClose:. The webview's close hook never runs, so the last
/// edits inside the autosave debounce are lost. There is nothing to intercept on
/// that path either: tao only emits RunEvent::ExitRequested when the last window is
/// destroyed or when app.exit() is called, and terminate: is neither.
///
/// So swap Quit for an item that closes the window. Closing runs the same flush the
/// red X runs, and destroying the last window exits the app anyway.
fn menu_with_saving_quit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;

    // The application submenu comes first, and Quit is its last item
    let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() else {
        return Ok(menu);
    };
    let items = app_menu.items()?;
    let Some(MenuItemKind::Predefined(quit)) = items.last() else {
        return Ok(menu);
    };
    // Reuse the system's own label so it stays localized
    let label = quit.text()?;

    app_menu.remove_at(items.len() - 1)?;
    app_menu.append(&MenuItem::with_id(
        app,
        QUIT_MENU_ID,
        label,
        true,
        Some("CmdOrCtrl+Q"),
    )?)?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .menu(menu_with_saving_quit)
        .on_menu_event(|app, event| {
            if event.id() == QUIT_MENU_ID {
                // close(), not destroy(): close is the one that asks the webview
                // first, which is where the flush lives.
                // ponytail: one window, so closing it is quitting. Iterate over
                // webview_windows() if Sietch ever opens a second.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::create_project,
            commands::project::open_project,
            commands::chapter::list_chapters,
            commands::chapter::create_chapter,
            commands::chapter::read_chapter,
            commands::chapter::save_chapter,
            commands::chapter::rename_chapter,
            commands::folder::create_folder,
            commands::folder::rename_folder,
            commands::folder::delete_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
