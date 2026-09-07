# Sietch — Feature Tracker

> *"The spice must flow."*

Last updated: 2026-09-04

---

## Where tracking lives

Feature status lives in **Linear**, team `SIE`. This file is a reference index: it lets us navigate the IDs from the repo, and it lets someone who clones the project understand the scope without Linear access.

**If the status here and the status in Linear disagree, Linear wins.**

Linear projects map to the phases:

| Phase | Linear project |
|-------|----------------|
| 1 | Fase 1 — The Spice Must Flow |
| 2 | Fase 2 — Desert Power |
| 3 | Fase 3 — The Golden Path |
| 4 | Fase 4 — The Kwisatz Haderach |
| — | Backlog — Sin fase asignada |

Available labels: `rust`, `js`, `css`, `sqlite`, `tiptap`, `ai`, `sync`, `premium`.

---

## Phase 1 — "The Spice Must Flow" (MVP)

**19 Done · 0 In Progress · 0 Todo**

| ID | Linear | Feature | Description | Status |
|----|--------|---------|-------------|--------|
| — | SIE-1 | `chapter.rs` — persistence | Container block: `create_chapter`, `read_chapter`, `save_chapter`, `list_chapters` + `ChapterMeta`. Parent of F-006→F-009 | 🟢 Done |
| F-001 | SIE-2 | Create project | Generates a folder with `sietch.json`, `chapters/`, `notes/`, `.sietch/` | 🟢 Done |
| F-002 | SIE-3 | Open project | Native folder picker, reads `sietch.json` | 🟢 Done |
| F-003 | SIE-4 | Recent projects | Persisted list of the last projects opened. Blocks F-088 | 🟢 Done |
| F-004 | SIE-5 | TipTap editor | StarterKit + Typography + CharacterCount + Placeholder | 🟢 Done |
| F-005 | SIE-6 | Sidebar tree | Nested folders, expand/collapse, and a remembered open state | 🟢 Done |
| F-006 | SIE-7 | Read chapter | Load a `.md` and render it in the editor | 🟢 Done |
| F-007 | SIE-8 | Save chapter | Editor → markdown → disk | 🟢 Done |
| F-008 | SIE-9 | Autosave | 2s debounce, ⌘S, chapter switch and window close. Status indicator in the status bar, and a failed write keeps the edit instead of dropping it | 🟢 Done |
| F-009 | SIE-10 | Create chapter | New `.md` + push to `chapter_order[]`. ⌘N takes the first free `Untitled N`; rename is F-021 | 🟢 Done |
| F-010 | SIE-11 | Arrakis Night theme | Default dark theme | 🟢 Done |
| F-011 | SIE-12 | SQLite init | `writing_sessions`, `word_counts`, `project_meta` | 🟢 Done |
| F-012 | SIE-13 | Basic toolbar | Bold, italic, H1-H3, blockquote, bullet list, inline code. Hidden in focus mode | 🟢 Done |
| F-013 | SIE-14 | i18n (en/es) | `typesafe-i18n` | 🟢 Done |
| F-014 | SIE-15 | Config persistence | `tauri-plugin-store` | 🟢 Done |
| F-015 | SIE-16 | Split panels | Draggable dividers, persisted width | 🟢 Done |
| F-016 | SIE-17 | Command palette | Cmd+K with `fuse.js` | 🟢 Done |
| F-017 | SIE-18 | Inspector panel | Inspection panel for the active document | 🟢 Done |
| F-088 | SIE-19 | Start screen | With the recents list. Moved up from the backlog | 🟢 Done |

### Where Phase 1 stands

Chapters round-trip to disk. `seedDemoData` is gone: the editor loads from `list_chapters` on project open, a sidebar click reads the file, and edits are written back as markdown.

The editor has a format row now: bold, italic, H1-H3, blockquote, bullet list and inline code, each button lit from `editor.isActive()`. StarterKit already owned those keyboard shortcuts, the row is what makes them visible. It hides in focus mode, which dims everything but the active block and has no business sharing the screen with a toolbar.

F-008 is done. The 2s debounce shipped with F-007, and this round added the status indicator, the error path and the flush on window close. We dropped the 30s interval from the scope: with a 2s debounce nothing sits unsaved that long, so a periodic timer would only ever fire a no-op save.

Hooking the close event hands window closing over to JS, so `capabilities/default.json` now grants `core:window:allow-destroy`. `core:default` does not include it and the window will not close without it.

Cmd+Q needed its own fix. The predefined Quit item runs `NSApplication terminate:`, which never sends `windowShouldClose:`, so the close hook never ran and the quit took the last two seconds of typing with it. `RunEvent::ExitRequested` is no help — tao only emits it when the last window is destroyed or when `app.exit()` is called. So `lib.rs` swaps the Quit item for one that closes the window, which already waits for the write. Quitting from the Dock's context menu still calls `terminate:` directly and still skips the flush.

F-005 closes Phase 1. `chapter_order` is gone from `sietch.json` and a `tree` took its place, so folders nest and the sidebar renders them depth-first. A project written before this opens as always: `load` lifts the old flat order into the tree once, and the old key is never written back.

Folders are categories. A leaf carries its `kind`, which is `chapter` everywhere today, so characters (F-089) and notes (F-023) join the same tree instead of getting one of their own. A folder owns no file, so an empty one deletes straight from the sidebar without going near `trash/`, and one with chapters inside refuses.

New chapters and folders are created inside the selected folder, and F-022 moves them afterwards. Drag a row to reorder it among its siblings, to drop it into another folder, or to take it back out to the root.

The drag runs on pointer events rather than HTML5 drag and drop. The window leaves Tauri's `dragDropEnabled` at its default, so the webview's own file-drop handler eats HTML5 drag events, and the three engines disagree about the drag image, autoscroll and dragover cadence besides. A drop here is a position and not only a target, which HTML5 DnD does not report anyway. `sortablejs` is out of `package.json`; nothing ever imported it.

`move_node` takes the sibling to land in front of, not an index. `open_project` prunes chapters whose file is missing from the copy the frontend holds and leaves them in `sietch.json`, so the two trees legitimately differ and one integer does not name the same gap on both sides. An id names one node in either.

The gap under a node at depth 3 followed by one at depth 0 is four different moves wearing one strip of pixels, so the pointer's horizontal position picks the level and the drop line is drawn at that indent. Without it there is no way back out to the root from the end of a folder.

Reordering works from the keyboard too. The list holds one roving tab stop rather than a stop per row, the arrows walk the rows, and Alt with an arrow moves the focused node: up and down step over one sibling and then out of the folder, left and right are the outliner's outdent and indent. A live region says where the node landed, because a keyboard move has nothing to look at and the row may have scrolled away. Alt+Left and Alt+Right are history back and forward in WebView2 and WebKitGTK, so all four are `preventDefault`ed whether or not the move has anywhere to go.

The full tree roles are not in. The rows are still `div`s, so a screen reader gets a focusable list, not `aria-level` and `aria-posinset`. Half of that pattern reads worse than none of it, so it waits for a pass of its own.

Which folders are closed is persisted per project in `config.json`, not in `sietch.json`. Collapsing a folder is not a change to the manuscript and has no business stamping its `modified`.

**Suggested order:** Phase 1 is closed. F-020 is what the sidebar asks for next.

### Chapter storage

Chapter files are `chapters/{uuid}.md`. The title lives in YAML frontmatter, so the tree references a UUID that survives a rename. That is what makes `rename_chapter` a one-line frontmatter rewrite — no file moves, no reordering:

```
---
title: Chapter One
---

Body text...
```

`word_count` and `modified` are derived on read, never stored. The `word_counts` table stays unused until F-024 needs session history.

`save_chapter` stores its `content` verbatim and never parses it, so the format is the frontend's call.

Titles are unique, and the frontend is what enforces it — `create_chapter` and `rename_chapter` write whatever they are sent. The backend only rejects what would corrupt the file: a blank title, or a newline inside the one-line frontmatter. Uniqueness is a sidebar concern, and the frontend already holds every title in the store, where the backend would have to read every chapter file to know.

⌘N takes the first free `Untitled N`. A rename to a name already in use is rejected and the field stays open, because picking a name yourself and having it silently become `Dune 2` is worse than being told no. Case counts as a difference: `Dune` and `dune` are two readable rows.

The frontend writes markdown. `marked` converts on read, `turndown` on write, both behind `src/services/chapters.ts`. Round-trips are lossy in principle; nothing is lost today, because StarterKit and Typography only emit nodes markdown has. The first extension that breaks that — Underline, a custom node — is when to revisit this.

Word counts are computed twice, from different sources. The right panel counts rendered text from the editor and updates live. The sidebar counts the markdown source and updates when a save lands, dropping tokens with no letter or digit so `#`, `-`, `>` and `---` are not words. They still disagree on a fenced code block's ` ``` `.

### Project tree

`sietch.json` holds the structure and the order in one field:

```json
"tree": [
  { "type": "folder", "id": "…", "title": "Part One", "children": [
    { "type": "item", "id": "…", "kind": "chapter" }
  ]},
  { "type": "item", "id": "…", "kind": "chapter" }
]
```

Nothing mirrors it, so there is no pair to keep in sync. `list_chapters` walks it depth-first for the ids of kind `chapter`, and an id whose `.md` is missing skips the listing the way it always did. `open_project` prunes those ids for good, and leaves folders alone: a folder has no file that could go missing.

The frontend applies each insert, rename and delete to its own copy of the tree instead of re-reading `sietch.json`, which is what `addChapter` already did for `documents`. The two agree because they apply the same move, and a reload settles it either way.

### Open decisions

None open in Phase 1.

---

## Phase 2 — "Desert Power"

**4 Done · 2 In Progress · 5 Backlog**

| ID | Linear | Feature | Description | Status |
|----|--------|---------|-------------|--------|
| F-020 | SIE-20 | Delete chapter | Soft delete to `trash/` | 🔲 Todo |
| F-021 | SIE-21 | Rename chapter | Frontmatter title rewrite. Editor toolbar, or double-click a sidebar row | 🟢 Done |
| F-022 | SIE-22 | Reorder chapters | Pointer-event drag & drop in the sidebar | 🟢 Done |
| F-023 | SIE-23 | Bene Gesserit Notes | CRUD over the files in `notes/` | 🔲 Todo |
| F-024 | SIE-24 | Spice Counter | Counts the current chapter only. Missing project total and session | 🟡 In Progress |
| F-025 | SIE-25 | Arrakis Day theme | Light theme. Landed early in Phase 1 | 🟢 Done |
| F-026 | SIE-26 | Theme toggle | With persisted preference. Landed early in Phase 1 | 🟢 Done |
| F-027 | SIE-27 | Sandworm Search | Full-text over the project `.md` files | 🔲 Todo |
| F-028 | SIE-28 | Keyboard shortcuts | Cmd+K/N wired. Cmd+S and Cmd+P missing | 🟡 In Progress |
| F-029 | SIE-29 | Per-chapter synopsis | Lives in the Inspector. Enables F-040/F-041 | 🔲 Todo |
| F-030 | SIE-30 | Per-chapter tags | Colored tags, used in the corkboard | 🔲 Todo |

### Open decision

- **F-027:** FTS5 versus grep. FTS5 adds an index we have to keep in sync with the files, which strains the "SQLite is regenerable cache" principle. Grep has no state and probably covers manuscripts of a few hundred thousand words.

---

## Phase 3 — "The Golden Path"

**13 in backlog**

| ID | Linear | Feature | Description |
|----|--------|---------|-------------|
| F-040 | SIE-31 | Corkboard view | Cards with title, synopsis, tags and color |
| F-041 | SIE-32 | Mentat Mode | Collapsible outline with inline editing |
| F-042 | SIE-33 | Stillsuit Mode | Distraction-free writing, toggle with Esc |
| F-043 | SIE-34 | Typewriter mode | Active line vertically centered |
| F-044 | SIE-35 | Water Discipline | Daily/weekly goals with a progress bar |
| F-045 | SIE-36 | Litany streaks | Consecutive writing days |
| F-046 | SIE-37 | CHOAM Ledger | Statistics dashboard |
| F-047 | SIE-38 | Session logging | Date, duration and words per session |
| F-048 | SIE-39 | Export PDF | Compile to PDF |
| F-049 | SIE-40 | Export DOCX | Word format for editors and agents |
| F-050 | SIE-41 | Export EPUB | Ebook with metadata |
| F-051 | SIE-42 | Compilation templates | Profiles: manuscript, ebook, draft |
| F-052 | SIE-43 | File watcher | Detect external changes to the `.md` files |

### Ordering notes

- **F-047 first.** It is the foundation for F-044, F-045 and F-046.
- **F-049 before F-048 and F-050.** Agents and publishers ask for `.docx`.
- **F-052 is in the wrong phase.** It is a real prerequisite for F-063/F-064: without a watcher, sync writes underneath the app and autosave overwrites what was synced. Move it up a phase if sync lands early.

### Architectural tension

**F-047** records the only project data we cannot regenerate from the `.md` files. If SQLite is a disposable cache, the sessions are lost when the DB is deleted. Either we accept the loss, or the sessions move out to a JSON file in `.sietch/`.

---

## Phase 4 — "The Kwisatz Haderach"

**10 in backlog.** This is where monetization lives.

| ID | Linear | Feature | Description | Tier |
|----|--------|---------|-------------|------|
| F-060 | SIE-44 | Encyclopædia | Internal wiki: characters, places, objects, events | Free |
| F-061 | SIE-45 | Bidirectional links | Mentions linked to entries | Free |
| F-062 | SIE-46 | Visual timeline | Project events, drag to reorder | Free |
| F-063 | SIE-47 | Guild Navigator — Git | Local version history, invisible to the user | 💰 Premium |
| F-064 | SIE-48 | Guild Navigator — Cloud | Sync to Cloudflare R2 | 💰 Premium |
| F-065 | SIE-49 | Snapshots | Manual versioning with a name | Free |
| F-066 | SIE-50 | Truthsayer — Pacing | Pacing analysis of the manuscript | 💰 Premium |
| F-067 | SIE-51 | AI summaries | Automatic per-chapter summary | 💰 Premium |
| F-068 | SIE-52 | AI consistency | Names, descriptions, timeline, locations | 💰 Premium |
| F-069 | SIE-53 | AI continuity | Context from what came before when opening a chapter | 💰 Premium |

### Why the tiers are defensible

Both carry real operating cost: R2 charges for storage and egress, the LLM APIs charge per token. This is not core behind a paywall, it is infrastructure that costs money. All the editing stays free.

### Notes

- **Start with F-067, not F-066.** Narrow scope, a result you can verify at a glance, and the output fills in the F-029 synopsis. F-066 is the easiest one to do badly: a generic pacing analysis helps nobody.
- **F-064 is the highest-risk feature in the roadmap.** Conflict resolution is what sinks the competitors in their reviews. Conservative merge that preserves both versions over automatic merge that loses paragraphs.
- **F-065 after F-063.** With Git already in place, a snapshot is a tag with a readable name. The other way around we end up with two versioning systems.

---

## Backlog — No phase assigned

**10 in backlog**

| ID | Linear | Feature | Description |
|----|--------|---------|-------------|
| F-080 | SIE-54 | Import Scrivener | Convert `.scriv` to the Sietch structure |
| F-081 | SIE-55 | Import Word/MD | Import standalone `.docx` or `.md` files |
| F-082 | SIE-56 | Fremkit plugins | Extension system |
| F-083 | SIE-57 | Multiple projects | Several Tauri windows |
| F-084 | SIE-58 | Split editor | Two editor panels side by side |
| F-085 | SIE-59 | Custom fonts | Configurable typeface |
| F-086 | SIE-60 | Markdown preview | Toggle rendered vs raw |
| F-087 | SIE-61 | Image support | Images in `assets/` |
| F-089 | SIE-62 | Character sheets | Structured sheets in the Encyclopædia |
| F-090 | SIE-63 | Mobile companion | Tauri 2.0 mobile |

> F-088 moved to Phase 1 and kept its ID.

### Candidates to move up

- **F-085 (custom fonts)** is a CSS variable, and people who spend hours in front of the editor value it a lot.
- **F-086 (markdown preview)** works as a debugging tool for the HTML↔markdown conversion even before we expose it to the user.
- **F-080 (import Scrivener)** is undervalued. Users frustrated with Scrivener are exactly the Sietch audience, and the friction of migrating is the only thing keeping them there. It is expensive (proprietary XML + binaries), but as an acquisition lever it is worth more than several Phase 3 items.

---

## Status legend

| Emoji | Linear | Status |
|-------|--------|--------|
| 🔲 | Backlog / Todo | Pending |
| 🟡 | In Progress | Under development |
| 🟢 | Done | Completed |
| ⏸️ | — | Paused |
| ❌ | Canceled | Dropped |

---

## Notes

- Priority is always a complete Phase 1 before moving forward
- The ID is fixed, it is not reused if a feature is removed
- F-013 → F-017 were assigned retroactively to features built during Phase 1 that were not planned
- Side project = no deadlines, but with order
