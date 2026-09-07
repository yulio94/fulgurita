mod commands;
mod db;
mod models;

use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::{Emitter, Manager};

/// Our stand-in for the predefined Quit item.
const QUIT_MENU_ID: &str = "sietch-quit";

/// Opens the settings modal. The window owns the UI, so this only forwards.
const SETTINGS_MENU_ID: &str = "sietch-settings";

/// What the frontend listens for. Matches the bus event it turns into.
const SETTINGS_EVENT: &str = "settings:open";

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
    // Same item, two homes. macOS keeps Settings at the top of the app menu,
    // under About and its separator — Tauri's default is About, separator,
    // Services, so index 2 is the slot. Windows and Linux have no app menu at
    // all: the first submenu is File, and Settings belongs at its foot, above
    // Quit. `CmdOrCtrl` resolves per platform, so the accelerator is one string.
    let quit_index = app_menu.items()?.len().saturating_sub(1);
    #[cfg(target_os = "macos")]
    let index = 2.min(quit_index);
    #[cfg(not(target_os = "macos"))]
    let index = quit_index;

    app_menu.insert(
        &MenuItem::with_id(
            app,
            SETTINGS_MENU_ID,
            "Settings…",
            true,
            Some("CmdOrCtrl+,"),
        )?,
        index,
    )?;
    app_menu.insert(&PredefinedMenuItem::separator(app)?, index + 1)?;

    // Everything below swaps Quit and is macOS's problem alone. It bails on a
    // menu shaped differently than expected, and Settings must outlive that.
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
        .plugin(tauri_plugin_process::init())
        .menu(menu_with_saving_quit)
        .on_menu_event(|app, event| {
            if event.id() == SETTINGS_MENU_ID {
                // The menu bar works with no window focused, so there may be
                // nothing to tell. Nothing to open in that case either.
                let _ = app.emit(SETTINGS_EVENT, ());
                return;
            }
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
            commands::project::set_project_language,
            commands::chapter::list_chapters,
            commands::chapter::create_chapter,
            commands::chapter::read_chapter,
            commands::chapter::save_chapter,
            commands::chapter::rename_chapter,
            commands::folder::create_folder,
            commands::folder::rename_folder,
            commands::folder::delete_folder,
            commands::tree::move_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
