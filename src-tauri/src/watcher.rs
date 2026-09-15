use crate::commands::docs::DOC_DIRS;
use crate::commands::research::RESEARCH_DIR;
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// What the frontend listens for. The payload is the ids of the documents whose
/// file changed, our own writes included — the frontend tells those apart.
const DOCS_CHANGED_EVENT: &str = "docs:changed";

/// Anything under `research/` was added, removed or changed. No payload: the
/// sidebar re-reads the whole folder, which is what it does on open anyway.
const RESEARCH_CHANGED_EVENT: &str = "research:changed";

/// Long enough to fold an editor's save (truncate and write, or temp file and
/// rename) into one event, short enough that a reload still feels immediate.
const DEBOUNCE: Duration = Duration::from_millis(300);

/// The watcher for the open project. Dropping a debouncer stops it, so
/// replacing the value is how a second project takes over from the first.
#[derive(Default)]
pub struct ProjectWatcher(Mutex<Option<Debouncer<RecommendedWatcher>>>);

/// Starts watching the project's documents and emits `docs:changed` with their
/// ids. One recursive watch on the root rather than one per folder in
/// `DOC_DIRS`: it survives a folder being deleted and recreated, and a folder
/// added to `DOC_DIRS` is covered without touching this.
#[tauri::command]
pub fn watch_project(
    app: AppHandle,
    state: State<'_, ProjectWatcher>,
    project_path: String,
) -> Result<(), String> {
    let mut debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| match result {
        Ok(events) => {
            let paths = || events.iter().map(|event| event.path.as_path());
            let ids = changed_doc_ids(paths());
            if !ids.is_empty() {
                let _ = app.emit(DOCS_CHANGED_EVENT, ids);
            }
            if touches_research(paths()) {
                let _ = app.emit(RESEARCH_CHANGED_EVENT, ());
            }
        }
        Err(e) => eprintln!("File watcher error: {e}"),
    })
    .map_err(|e| format!("Failed to start the file watcher: {e}"))?;

    debouncer
        .watcher()
        .watch(&PathBuf::from(&project_path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch the project: {e}"))?;

    *state.0.lock().map_err(|e| e.to_string())? = Some(debouncer);
    Ok(())
}

/// The document ids behind a batch of changed paths: every `.md` whose folder
/// is in `DOC_DIRS`, named by its stem the way `query_docs` names it. That drops
/// `trash/`, `.fulgurita/` and the temp files editors write next to the real one.
///
/// Matched on the folder's name, never by stripping the project root: FSEvents
/// reports canonical paths (`/private/var/...`) and Windows may add `\\?\`, so a
/// prefix compare against the path we were handed breaks on both.
fn changed_doc_ids<'a>(paths: impl Iterator<Item = &'a Path>) -> Vec<String> {
    paths
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        })
        .filter(|path| {
            path.parent()
                .and_then(|dir| dir.file_name())
                .and_then(|name| name.to_str())
                .is_some_and(|name| DOC_DIRS.contains(&name))
        })
        .filter_map(|path| path.file_stem()?.to_str().map(str::to_string))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

/// True when a batch holds a path inside `research/`, at any depth. Matched on a
/// component for the same reason `changed_doc_ids` matches on a folder name.
// ponytail: a project that itself sits inside a folder named `research` reloads
// the research list on every save. Harmless; compare against the canonical root
// if it ever shows up.
fn touches_research<'a>(mut paths: impl Iterator<Item = &'a Path>) -> bool {
    paths.any(|path| {
        path.components()
            .any(|component| component.as_os_str() == RESEARCH_DIR)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_documents_in_a_document_folder_count() {
        let paths = [
            "/p/chapters/a.md",
            "/p/chapters/a.md",
            "/p/notes/b.MD",
            "/p/trash/c.md",
            "/p/.fulgurita/fulgurita.db",
            "/p/chapters/.a.md.swp",
            "/p/chapters/4913",
        ]
        .map(PathBuf::from);

        assert_eq!(
            changed_doc_ids(paths.iter().map(PathBuf::as_path)),
            ["a", "b"]
        );
    }

    #[test]
    fn a_change_anywhere_under_research_is_reported() {
        let hit = [
            PathBuf::from("/p/chapters/a.md"),
            PathBuf::from("/p/research/sub/x.pdf"),
        ];
        let miss = [
            PathBuf::from("/p/chapters/a.md"),
            PathBuf::from("/p/trash/b.md"),
        ];
        assert!(touches_research(hit.iter().map(PathBuf::as_path)));
        assert!(!touches_research(miss.iter().map(PathBuf::as_path)));
    }
}
