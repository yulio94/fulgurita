# Fulgurita

A desktop writing app for long-form manuscripts.

A book takes years, and the files should outlast the app you wrote it in. Fulgurita keeps each chapter as a Markdown file in a folder on your own disk. You can read the text in any editor, back it up with any tool, and put it under version control. There is no account and no server.

Fulgurita is early. It is a good place to draft chapters today. It cannot export a finished manuscript yet, see [Not built yet](#not-built-yet).

## Platforms and requirements

- **Systems.** We build for macOS, Windows and Linux from one codebase. So far only macOS has been run by hand. CI builds and tests on all three.
- **Account.** None. Nothing to sign up for.
- **Getting it.** There are no releases yet. Building from source is the only way to run it, see [Build and test](#build-and-test).

## What works today

- **Projects.** Create a project folder, open one with the native folder picker, reopen from the recent list on the start screen.
- **Editor.** A TipTap editor with a format bar (bold, italic, H1-H3, blockquote, bullet list, inline code), named paragraph styles, and a focus mode that dims everything but the active paragraph and folds both panels. Chapters are converted to Markdown on save and back on load. The conversion is lossy in principle. Nothing the editor emits today is lost, but a future extension with no Markdown equivalent would be.
- **Autosave.** Two seconds after you stop typing, on ⌘S / Ctrl+S, on chapter switch and on window close. A failed write keeps your edit and says so in the status bar. On macOS, quitting from the Dock's context menu skips the final save, so the last two seconds of typing can be lost. Quit from the menu or ⌘Q instead.
- **Manuscript tree.** Nested folders in the sidebar. Reorder by dragging, or from the keyboard with Alt and the arrow keys. Rename, and delete to a trash you can view and restore from. The rows are not yet exposed to screen readers as a tree, so a screen reader hears a flat list with no nesting levels.
- **Inspector.** Per-chapter tags with colors, a synopsis, stats and a document outline. Word count covers the current chapter only, with no project total. The Inspector also has a notes field, but it is never saved: what you type there is gone when the project closes.
- **External edits.** A file watcher notices when a chapter changes on disk. A clean editor reloads, an editor with unsaved typing asks whether to reload or keep yours.
- **Everything else.** A ⌘K / Ctrl+K command palette, light and dark themes, and an English and Spanish interface.

The custom titlebar and the icons in the sidebar's right-click menu have only been looked at on macOS. They may look wrong on Windows and Linux.

## Not built yet

- **Export.** No PDF, DOCX or EPUB. You cannot get the manuscript out of the app as one document. A Typst typesetting module is in the backend for this, but nothing calls it yet.
- **Import.** No Scrivener, Word or Markdown import.
- **Views.** No corkboard and no outline view.
- **Search.** No full-text search.
- **Notes and snapshots.** A `notes/` folder is created with every project, but the app does not open notes yet. No snapshots or version history.
- **Writing history.** No project word total, no session log, no streaks.

## Your data

Everything about a manuscript lives in its project folder:

```
My Novel/
├── fulgurita.json          # chapter order and folders, trash log, tag colors, project settings
├── chapters/{uuid}.md      # one file per chapter, YAML frontmatter + Markdown body
├── notes/                  # created, not used yet
├── trash/{uuid}.md         # deleted chapters, until you restore them
└── .fulgurita/fulgurita.db # SQLite, see below
```

What this means if you open the folder in another editor:

- The chapter text is plain Markdown. Title, language, tags and synopsis sit in the YAML block at the top of the file.
- Files are named by UUID, not by title. Chapter order and folders exist only in the `tree` field of `fulgurita.json`. Another editor shows a flat folder of UUID-named files in no particular order.
- Paragraph styles are stored as `<!-- fulgurita:style-name -->` comments above the paragraph. Other editors show them as raw comments or drop them.
- The SQLite database is created on every open and holds no data today. It is meant as a cache we can rebuild from the files.

App settings go to `config.json` in your OS app data directory: recently opened project paths, panel widths and which panels are open, which folders are collapsed, the chosen view, theme, language, focus mode and the daily goal.

**Network.** The app makes no network requests. Its fonts ship with it. There is no telemetry.

## Planned paid services

We plan sync across devices and AI analysis of a manuscript (summaries, consistency, pacing) as paid services, because both cost money to run. Neither is built. Neither can be bought. There are no accounts. Writing and editing stay free.

## Build and test

You need Node 24, pnpm 10 and stable Rust, plus the Tauri v2 system dependencies for your OS, see [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/). On Debian or Ubuntu that is:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev
```

```bash
pnpm install
pnpm tauri dev      # run the app with hot reload
pnpm tauri build    # production bundle for the current OS
pnpm test           # frontend tests (Vitest)
pnpm check          # Biome lint and format check
cargo test --manifest-path src-tauri/Cargo.toml
```

**Last test run:** 2026-09-14, macOS (Darwin 25.6), commit `7d99845`. `pnpm test`: 23 files, 182 tests passed. `cargo test`: 95 tests passed. Nothing was run on Windows or Linux.

CI runs Biome, the frontend build, both test suites, clippy and a release build on Ubuntu 24.04, macOS and Windows.

## Code map

| Path | What it holds |
|------|---------------|
| `src/main.ts` | Frontend bootstrap: builds the layout, mounts components, wires project open and save |
| `src/components/editor/` | TipTap editor, format bar, paragraph styles |
| `src/components/sidebar/` | Manuscript tree, drag and keyboard reorder, context menu, view switcher |
| `src/components/inspector/` | Tags, synopsis, stats, outline |
| `src/components/statusbar/` | Word count, save status |
| `src/components/start-screen/` | Create, open and recent projects |
| `src/components/settings/` | Settings modal |
| `src/components/titlebar/` | Custom titlebar, focus mode and theme switch |
| `src/components/command-palette/` | ⌘K / Ctrl+K palette |
| `src/core/` | Reactive store and typed event bus |
| `src/services/` | Markdown conversion, config, tree logic, view providers, shortcuts, platform checks |
| `src/i18n/` | English and Spanish strings (`typesafe-i18n`) |
| `src/styles/` | Design tokens and the app grid |
| `src-tauri/src/lib.rs` | Tauri builder, menu, command registration |
| `src-tauri/src/commands/` | Project, chapter, folder, tree and document query commands |
| `src-tauri/src/models/` | `fulgurita.json` and frontmatter parsing |
| `src-tauri/src/db/` | SQLite setup |
| `src-tauri/src/watcher.rs` | File watcher for external edits |
| `src-tauri/src/typeset.rs` | Typst typesetting, for the export that is not built yet |
| `docs/adr/` | Architecture decision records |

## License and trademark

Fulgurita is licensed under the GNU Affero General Public License v3.0, see [`LICENSE`](LICENSE).

The name "Fulgurita" and its logo identify this project. The AGPL covers the code and grants no trademark rights. If you ship a fork, give it another name.
