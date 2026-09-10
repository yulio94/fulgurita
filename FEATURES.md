# Sietch — Feature Tracker

Last updated: 2026-09-10

---

## Where tracking lives

Feature status lives in **Linear**, team `SIE`. This file is a reference index: it lets us navigate the IDs from the repo, and it lets someone who clones the project understand the scope without Linear access.

**If the status here and the status in Linear disagree, Linear wins.**

Linear projects map to the phases:

| Phase | Linear project |
|-------|----------------|
| 1 | Fase 1 — Foundation |
| 2 | Fase 2 — Daily Writing |
| 3 | Fase 3 — Structure & Output |
| 4 | Fase 4 — Sync & Intelligence |
| — | Vistas y metadata |
| — | Backlog — Sin fase asignada |

Available labels: `rust`, `js`, `css`, `sqlite`, `tiptap`, `ai`, `sync`, `premium`.

---

## Phase 1 — Foundation (MVP)

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
| F-010 | SIE-11 | Dark theme | The default theme | 🟢 Done |
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

Folders are categories. A leaf carries its `kind`, which is `chapter` everywhere today, so characters (F-089) and notes (F-023) join the same tree instead of getting one of their own. A folder owns no file, so an empty one deletes without going near `trash/`. F-020 settled what a full one does: it takes its chapters with it, after a confirmation that names how many.

New chapters and folders are created inside the selected folder, and F-022 moves them afterwards. Drag a row to reorder it among its siblings, to drop it into another folder, or to take it back out to the root.

The drag runs on pointer events rather than HTML5 drag and drop. The window leaves Tauri's `dragDropEnabled` at its default, so the webview's own file-drop handler eats HTML5 drag events, and the three engines disagree about the drag image, autoscroll and dragover cadence besides. A drop here is a position and not only a target, which HTML5 DnD does not report anyway. `sortablejs` is out of `package.json`; nothing ever imported it.

`move_node` takes the sibling to land in front of, not an index. `open_project` prunes chapters whose file is missing from the copy the frontend holds and leaves them in `sietch.json`, so the two trees legitimately differ and one integer does not name the same gap on both sides. An id names one node in either.

The gap under a node at depth 3 followed by one at depth 0 is four different moves wearing one strip of pixels, so the pointer's horizontal position picks the level and the drop line is drawn at that indent. Without it there is no way back out to the root from the end of a folder.

Reordering works from the keyboard too. The list holds one roving tab stop rather than a stop per row, the arrows walk the rows, and Alt with an arrow moves the focused node: up and down step over one sibling and then out of the folder, left and right are the outliner's outdent and indent. A live region says where the node landed, because a keyboard move has nothing to look at and the row may have scrolled away. Alt+Left and Alt+Right are history back and forward in WebView2 and WebKitGTK, so all four are `preventDefault`ed whether or not the move has anywhere to go.

The full tree roles are not in. The rows are still `div`s, so a screen reader gets a focusable list, not `aria-level` and `aria-posinset`. Half of that pattern reads worse than none of it, so it waits for a pass of its own.

Which folders are closed is persisted per project in `config.json`, not in `sietch.json`. Collapsing a folder is not a change to the manuscript and has no business stamping its `modified`.

**Suggested order:** Phase 1 is closed. F-020 closed the tree's CRUD, so the sidebar is done asking.

### Chapter storage

Chapter files are `chapters/{uuid}.md`. The title lives in YAML frontmatter, so the tree references a UUID that survives a rename. That is what makes `rename_chapter` a one-line frontmatter rewrite — no file moves, no reordering. F-070 made it the same block on every document type, and `create_chapter` emits it whole:

```
---
id: fa9b3de7-5f81-4171-9f5c-016b901c188a
type: chapter
language: en
title: Chapter One
tags: []
---

Body text...
```

`synopsis` and `pov` are skipped when empty, so a chapter nobody has summarised or assigned a POV to carries neither key. A file that arrives with no block at all opens on defaults and gains one on its first save, which is what keeps a `.md` written in another editor readable here.

`word_count` and `modified` are derived on read, never stored. The `word_counts` table stays unused until F-024 needs session history.

`save_chapter` stores its `content` verbatim and never parses it, so the format is the frontend's call.

Titles are unique, and the frontend is what enforces it — `create_chapter` and `rename_chapter` write whatever they are sent. The backend only rejects a blank title. A newline in one is folded to a space rather than refused — a title occupies a single line of the block, unlike `synopsis`, which is written as a block scalar and keeps the newlines it was given. Uniqueness is a sidebar concern, and the frontend already holds every title in the store, where the backend would have to read every chapter file to know.

⌘N takes the first free `Untitled N`. A rename to a name already in use is rejected and the field stays open, because picking a name yourself and having it silently become `Prologue 2` is worse than being told no. Case counts as a difference: `Prologue` and `prologue` are two readable rows.

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

## Phase 2 — Daily Writing

**7 Done · 2 In Progress · 2 Backlog**

| ID | Linear | Feature | Description | Status |
|----|--------|---------|-------------|--------|
| F-020 | SIE-20 | Delete chapter | Soft delete to `trash/`, from a right-click menu. A folder takes its chapters with it | 🟢 Done |
| F-021 | SIE-21 | Rename chapter | Frontmatter title rewrite. Editor toolbar, double-click a sidebar row, or the right-click menu | 🟢 Done |
| F-022 | SIE-22 | Reorder chapters | Pointer-event drag & drop in the sidebar | 🟢 Done |
| F-023 | SIE-23 | Notes | CRUD over the files in `notes/` | 🔲 Todo |
| F-024 | SIE-24 | Word count | Counts the current chapter only. Missing project total and session | 🟡 In Progress |
| F-025 | SIE-25 | Light theme | Landed early in Phase 1 | 🟢 Done |
| F-026 | SIE-26 | Theme toggle | With persisted preference. Landed early in Phase 1 | 🟢 Done |
| F-027 | SIE-27 | Full-text search | Full-text over the project `.md` files | 🔲 Todo |
| F-028 | SIE-28 | Keyboard shortcuts | Cmd+K/N wired. Cmd+S and Cmd+P missing | 🟡 In Progress |
| F-029 | SIE-29 | Per-chapter synopsis | Frontmatter field, edited in the Inspector. Enables F-040/F-041 | 🟢 Done |
| F-030 | SIE-30 | Per-chapter tags | Names in the frontmatter, colors in `sietch.json`. Edited in the Inspector | 🟢 Done |

### Tags

A tag's name lives in its chapter's own frontmatter, as `tags: ["harbour", "pov-paul"]`. The color it is drawn in lives in `sietch.json`, as a `tag_colors` map from name to palette color. The split is the portability promise: a tag is something the writer said about the chapter and it travels with the file, a color is how we happen to draw it and it means the same thing in every chapter carrying that tag. Putting the color in the block would be N copies of one fact, and a `.md` opened in Obsidian would carry a Sietch presentation detail for no reason.

`set_chapter_tags` takes the whole list rather than an add and a remove. The file is rewritten either way and the Inspector already holds every tag it is drawing, so two commands would be two write paths for one edit. It rewrites the `tags:` entry in place, the same way `rename_chapter` rewrites `title:`, and refuses a chapter whose block is broken for the same reason. The two writers splice opposite halves — `save_chapter` keeps the block and replaces the body, `set_chapter_tags` keeps the body and rewrites one entry — so an autosave landing between them cannot clobber either.

`set_title_in` and `set_tags_in` are now one function with the key passed in. The only real difference was that a block sequence may sit flush at the parent's column (`tags:` above `- prologue`), and a flush `- ` line can only ever belong to the key above it, which is already the condition for a value that spills. So the continuation rule widened by two characters and the two operations became the same one. A blank line inside a value goes with it too: leaving it ends the spill early and strands the items below the new entry as garbage.

Tags are written as a one-line flow sequence, which is what `fill_missing_in` already emits and the reason the entry can be rewritten a line at a time. Each item is quoted through `serde_json` rather than the `scalar` helper — `scalar` renders for block context, and inside `[...]` a tag holding `,` or `]` would come back split. A hand-written block sequence is rewritten to flow on the first tag edit of that chapter, and nowhere else.

Colors are six named tokens, drawn as a dot inside the chip rather than behind its text. A filled chip would need a contrast decision per hue per theme; a dot only has to be told apart from the other five, so legibility stays the sand ramp's job and the palette needs no dark override at all. The stored value is a name, not a color, so a theme change restyles every chip, and a name we do not know resolves to nothing — which is what makes a hand-edited `sietch.json` harmless without a branch to write.

Nothing prunes `tag_colors` when the last chapter carrying a tag goes. It is a few bytes, and a writer who re-adds the tag next week gets their color back.

### The synopsis

F-070 settled where it goes: a `synopsis` key in the chapter's own frontmatter,
beside `title` and `tags`. `sietch.json` holds the tree and the trash and no
per-chapter metadata at all, so keeping it there would have meant two places to
look for what a chapter is.

It is prose, so it keeps its newlines, and F-030 had already paid for that.
`set_synopsis_in` is `set_entry_in` with `scalar()`, the same pair `title` uses,
and saphyr renders a multi-line string as a `|-` block scalar with its
continuation lines indented — so the entry stays one entry and still reads as a
summary in a text editor. The widened continuation rule F-030 wrote for block
sequences is what carries an old three-line synopsis out with the value it
belonged to when the field is rewritten.

An empty synopsis is skipped when serializing, so a chapter nobody has
summarised carries no key. Clearing one that exists writes `synopsis: ""`
instead of dropping the key, because the change has to reach the file and an
absent key reads as never-written. The same `skip_serializing_if` reaches the
IPC payload, which is why `Frontmatter.synopsis` is optional on the TypeScript
side while `ChapterMeta.synopsis` is always a string — the corkboard reads a
listing, and a card is easier to render from `""` than from absent.

It writes on blur rather than on a debounce. Nobody types a summary a character
at a time the way they type a manuscript, and moving to another chapter blurs
the field first, so the write lands before the doc changes. The Inspector's
`activeDoc` handler skips while the field has focus — an autosave writes
`activeDoc` too, and it must not land on top of the typing.

### The trash

`delete_chapter` moves `chapters/{uuid}.md` to `trash/{uuid}.md` and drops the node from the tree. The file is never read on the way out. A chapter whose frontmatter block is broken is the one most likely to be on its way to the trash, and every write path refuses that file — parsing here would make it the one chapter nobody can delete. `restore_chapter` moves it back and appends it to the root; where it used to sit is not recorded.

Delete is offered from a right-click on the row, beside Rename. It is the sidebar's first context menu. Double-click was already the inline rename and a two-line row has nowhere to put a button that does not crowd the title.

The menu is `Menu.popup()` from `@tauri-apps/api/menu`, so it is the OS menu and not a styled div. That buys the platform's own appearance, keybindings, dismissal and edge clamping, none of which we then maintain. `core:default` already grants `core:menu:default`, which carries `allow-popup`, so `capabilities/default.json` needed nothing. A right-click passes no position and the OS puts the menu at the cursor.

All three webviews raise a menu of their own on right-click, so the event is cancelled — but only over a row. In the editor that menu carries spell-check and clipboard items worth keeping. Windows and Linux raise `contextmenu` from the Menu key and Shift+F10 on their own; macOS has neither, so the sidebar raises it from Shift+F10 itself and passes the row's position, having no cursor to fall back on.

Deleting a chapter does not ask. The file is recoverable, so a modal over a reversible move is friction. Deleting a folder does ask, because it takes more than the row that was clicked, and the confirmation names the folder and the count.

`sietch.json` gained a `trash` array of `{ id, deleted }`. The date could not go in the file's own frontmatter for the reason above, and it is the one thing about a delete we cannot work out later. Two fields only: the title is still in the trashed file, where every other chapter keeps it.

F-112 is the view over it, and the way back. `list_trash` reads the folder rather than the `trash` array: the array records when a delete happened, the folder records what is deleted, and those are not the same list. A file copied in by hand lists with no date, an entry whose file is gone lists nothing. `restore_chapter` already believed this — it checks the folder first and only then drops the entry.

The trash is the second `ViewProvider` (F-072), which is what that interface was for. It answers `reorderable: false`, and that one flag now gates the drag, the inline rename and the header's new buttons — a view not backed by `sietch.json`'s tree is one nothing can be written through. The interface gained `menu(node)` and `open(doc)` to go with it: the context menu was hardcoded to rename-and-delete and read `projectMeta.tree` directly to decide folder-ness, which is wrong for any view that is not the manuscript. Restore is the trash's only item, and a trashed row does not open — `read_chapter` only looks under `chapters/`.

Two ways in, both from F-073, which landed after this: the header title is a native `<select>` over `views`, and the command palette carries one row per registered view. Both call `setProvider` and write the id through `setView`, so a pick from either is the one remembered, and a view appended to `views` gets both for free. The stored key is global rather than per project the way `collapsed` is, because which angle you read a manuscript from is a habit of the writer. Restoring lands at the root, and a drag is the way back into a folder — the parent is still not recorded, and a recorded one is stale whenever the folder went to the trash too.

Nothing sweeps `trash/` yet. A 30-day expiry is a hard delete, which is what this format exists to avoid, so it needs a setting the writer controls, and a decision about a file with no recorded date — counting from when we first saw it is the reasonable answer, and that one means writing an entry the first time `list_trash` sees the file, which it deliberately does not do today. F-115 is that ticket. The recorded date is what makes it small when we get there.

Both deletes are handled in `main.ts` rather than the sidebar. The open chapter has to be flushed before its file moves, and `main.ts` is the only place holding the editor's flush. Deleting the last chapter in a project makes a fresh one, the same line `loadChapters` holds on open. Restore is handled there too, for the second half of that reason: it adds to the chapter list. It needs no flush, and it asks nothing — putting a chapter back takes nothing away.

### Open decision

- **F-027:** FTS5 versus grep. FTS5 adds an index we have to keep in sync with the files, which strains the "SQLite is regenerable cache" principle. Grep has no state and probably covers manuscripts of a few hundred thousand words. F-071 went the other way and shipped its query with no table behind it, so FTS5 is the only thing left asking for one.

---

## Phase 3 — Structure & Output

**13 in backlog**

| ID | Linear | Feature | Description |
|----|--------|---------|-------------|
| F-040 | SIE-31 | Corkboard view | Cards with title, synopsis, tags and color |
| F-041 | SIE-32 | Outline view | Collapsible outline with inline editing |
| F-042 | SIE-33 | Focus mode — fullscreen and Esc | Fullscreen, and Esc to leave. Dimming and folded panels shipped in Phase 1 |
| F-043 | SIE-34 | Typewriter mode | Active line vertically centered |
| F-044 | SIE-35 | Writing goals | Daily/weekly goals with a progress bar |
| F-045 | SIE-36 | Writing streaks | Consecutive writing days |
| F-046 | SIE-37 | Statistics dashboard | One view over F-044, F-045 and F-047 |
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

## Phase 4 — Sync & Intelligence

**10 in backlog.** This is where monetization lives.

| ID | Linear | Feature | Description | Tier |
|----|--------|---------|-------------|------|
| F-060 | SIE-44 | Encyclopedia | Internal wiki: characters, places, objects, events | Free |
| F-061 | SIE-45 | Bidirectional links | Mentions linked to entries | Free |
| F-062 | SIE-46 | Visual timeline | Project events, drag to reorder | Free |
| F-063 | SIE-47 | Version history — Git | Local, and invisible to the user | 💰 Premium |
| F-064 | SIE-48 | Sync — Cloud | Sync to Cloudflare R2 | 💰 Premium |
| F-065 | SIE-49 | Snapshots | Manual versioning with a name | Free |
| F-066 | SIE-50 | Pacing analysis | Over the whole manuscript | 💰 Premium |
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

**24 listed below.** Linear also holds F-101 to F-111, which this table has
never carried.

| ID | Linear | Feature | Description |
|----|--------|---------|-------------|
| F-070 | SIE-64 | Universal frontmatter | A YAML block on every document, and a tolerant read for a file without one |
| F-071 | SIE-66 | Document query | A query over the documents, and no index behind it |
| F-072 | SIE-65 | ViewProvider | The sidebar tree asks a provider for its nodes and knows nothing else |
| F-073 | SIE-67 | View switcher | The view menu in the sidebar header, and the picked view remembered |
| F-074 | SIE-68 | Codex view | Documents grouped by `type`: characters, places, events and ideas as virtual folders |
| F-075 | SIE-69 | POV and Tags views | Two more providers, one grouping chapters by `pov` and one by each tag they carry |
| F-076 | SIE-70 | Recall panel | Every chapter a character appears in, from the frontmatter and from the body |
| F-080 | SIE-54 | Import Scrivener | Convert `.scriv` to the Sietch structure |
| F-081 | SIE-55 | Import Word/MD | Import standalone `.docx` or `.md` files |
| F-082 | SIE-56 | Plugins | Extension system |
| F-083 | SIE-57 | Multiple projects | Several Tauri windows |
| F-084 | SIE-58 | Split editor | Two editor panels side by side |
| F-085 | SIE-59 | Custom fonts | Configurable typeface |
| F-086 | SIE-60 | Markdown preview | Toggle rendered vs raw |
| F-087 | SIE-61 | Image support | Images in `assets/` |
| F-089 | SIE-62 | Character sheets | Structured sheets in the Encyclopedia |
| F-090 | SIE-63 | Mobile companion | Tauri 2.0 mobile |
| F-100 | SIE-83 | Project profiles | `sietch.json` says what kind of writing the project holds |
| F-112 | SIE-95 | Trash: view and restore | A view over `trash/`, and the way back into the manuscript |
| F-113 | SIE-96 | Native component audit | Which widgets should be the OS one instead of our HTML |
| F-114 | SIE-97 | Icons in the context menu | An icon on every row of the sidebar's context menu |
| F-115 | SIE-98 | Trash: expiry | A hard delete after N days, with a setting the writer controls |
| F-121 | SIE-112 | Profile registry | Which views a project type offers, once a view exists that is not offered to all of them |
| F-118 | SIE-106 | Interface restyle | The app on the `Sietch.dc.html` design: seven colour roles, new typefaces, a titlebar of our own |

> F-088 moved to Phase 1 and kept its ID.

### Menu icons

F-114 puts an icon on every row of the context menu. `ViewMenuItem` gained
`icon`, and it is required for the reason `reorderable` is: a new view has to
answer.

`NativeIcon` was the obvious way and it half works. It does reach Rust — `Icon`
is untagged with `Native` first, so the string binds to the enum before it is
tried as a path — but the Windows and GTK backends take it as `_native_icon` and
store nothing. So macOS gets real template images for delete and restore, which
AppKit tints for light, for dark and for the highlighted row, and the other two
platforms get three stroked paths drawn on a canvas and handed over as RGBA. No
icon files entered the repo, and nothing was added to `Cargo.toml` or the
capabilities: `JsImage::Rgba` needs no feature and `core:default` already grants
`core:image:allow-new`.

Rename has no template image. AppKit ships nothing that means rename, so it
rasterizes on macOS too, and a highlighted row inverts the other two and leaves
it alone. If that mix reads badly, dropping the two native icons makes all three
consistent.

The GTK risk the ticket flagged is not real. muda wraps a `GtkImage` and an
`AccelLabel` in a plain `gtk::MenuItem` rather than the deprecated
`GtkImageMenuItem`, so the theme setting that hides menu icons never applies.
What is still unchecked is the look on Windows and Linux: that the bitmap does
not stretch the row height, and that GTK's forced 16x16 downscale holds up on a
HiDPI display.

### The document query

F-071 asked for a SQLite index: a table of documents, a typed table of relations
between them, a table of inline references, rebuilt from the frontmatters and
patched on every save. We shipped `query_docs` and no index.

`list_chapters` already reads and parses every chapter's frontmatter when a
project opens, and the frontend holds the result in `documents`. Grouping by
type, by POV or by tag is a filter over an array that is already in memory, so a
table would have bought a second copy of it, an invalidation path, a connection
to hold somewhere, and a row that goes stale the moment someone edits a `.md` in
Obsidian. F-052 is the watcher that would notice, and it is a phase away.

`query_docs` is the contract F-074 and F-075 call. It walks `chapters/` and
`notes/`, which is the one way it differs from `list_chapters`, and that walk is
the reason it exists: `notes/` has no tree entries at all, and a file dropped
into `chapters/` by hand is a document whether or not `sietch.json` has heard of
it. A table can slide in behind the signature later without a caller noticing.

The relations and the inline references are not here, and could not have been.
Frontmatter has no `characters` or `places` key, no character or place document
exists to point at, and nothing writes `[[...]]`. Each table is a few lines in
the ticket that creates its data, F-076 and F-061.

`pov` joins the block. F-075 groups by it and nothing else supplies it, and POV
is written as a tag today, which files a chapter beside `subplot-heist`.
Nothing in the app writes the key yet; F-075 brings the Inspector field. A
hand-written one already survives a save, because the block is spliced and never
rebuilt. It is skipped when empty the way `synopsis` is, and `fill_missing_in`
leaves it out for the same reason: a chapter nobody has assigned a POV to has
nothing to catch up on.

The filter carries `pov: ""` as its own case, distinct from leaving `pov` out.
That is the "no POV assigned" group F-075 draws, and it is why the field is an
`Option<String>` on the Rust side.

### The interface restyle

F-118 takes the app to a Claude Design mockup. Most of it is a token swap, and
it was cheap for a reason: no component had ever written a colour down. All 127
of them went through `var(--sand-N)`, so the ten numeric steps could be replaced
by the seven roles the design draws — `bg`, `panel`, `ink`, `muted`, `faint`,
`rule`, `sel` — without touching a component's markup. Two steps split by
context and were done by hand: `sand-200` is a border in some places and a fill
in others, `sand-100` a page surface in two and an inset card everywhere else.

A ramp was the wrong shape anyway. It makes every rule pick a step and hope it
survives the theme, and the dark theme is not the light one inverted. It is a
cool blue-grey with its own values, so the steps would not have survived it.

The structural half is the titlebar. `titleBarStyle: Overlay` is macOS-only and
the other two platforms ignore it, so nothing in Rust branches; the one
difference is the spacer that reserves room for the traffic lights, and it reads
`isMac` from `services/platform.ts`, which already existed for the shortcuts.
Windows and Linux keep their own bar above ours and reserve nothing.

Overlay cost us one thing we did not expect. It hands that strip to the webview,
so the system titlebar is no longer under the pointer to answer a double-click,
and Tauri's drag region covers dragging and not the zoom. The bar calls
`toggleMaximize` itself now, which also gives Windows and Linux a gesture they
never had.

Focus mode folds both panels as well as dimming the paragraphs. It reads
`sidebarOpen` and `inspectorOpen` rather than writing them, so whatever the
writer had open is what comes back. That widening exposed an older assumption:
the format bar and the style menu both hid themselves on `focusMode`, which was
right when focus mode only meant distraction-free typing and left the writer
with no paragraph styles at all once it meant folding the chrome. Both
subscriptions are gone and the dock's own fade does the work.

The chapter title does not hold the drawn value. The design sets it at 42px on a
1200px artboard, and 42px against a real window reads small, so it scales with
the viewport. At that size a long name runs past the measure, which is why it is
a `<textarea>` and not an `<input>`: an input can only scroll a long title out
of sight. Enter commits in place instead of opening a second line, and that is
what keeps the field focused when a name is rejected.

What is unchecked is the window itself. Nobody has confirmed that the macOS
traffic lights clear the brand inside the 40px bar, or that Windows and Linux
leave no gap where the spacer would be. The eyebrow counts the chapter's
position over the tree on every render, which is fine until a manuscript is
large enough to measure. Fonts still come from Google, so a first run with no
network shows the fallbacks — that predates this change. And the sidebar keeps
its excerpt line, so its rows are three lines where the design draws two.

### Project profiles

F-100 asked for `project_type` in `sietch.json` and a registry mapping each type
to three things: the views it offers, the frontmatter a new chapter gets, and the
export profile it preselects. We shipped the field and one of the three, and the
one we shipped is the field itself.

None of the three had a reader. `views` is `manuscript` and `trash`, and both are
offered to every project, so filtering that array by type returns the array. For
`novel` the frontmatter defaults are what `create_chapter` already writes — the
table's one row is the identity. And there is no export code in `src-tauri/` at
all, so `export_profile` would have stored a preselection for a feature that does
not exist.

So `frontmatter_defaults` and `export_profile` are dropped, and they come back
with the ticket that gives them data. `default_views` is deferred rather than
dropped, and F-121 is where it went: F-074 is the first view not offered to every
project, it touches `services/providers.ts` anyway, and it brings a real view to
test a filter against. The filter is also not the one-line change the ticket assumed. The
sidebar `<select>` is filled once in `createSidebar` and the `projectMeta`
subscription only repaints `#doc-list`, so a type changed in settings would leave
the menu stale until relaunch; and three lookups have to agree or they drift —
the option build, `view:show`, and the persisted-view restore, which is a global
id and can already name a view the current project would not offer.

`project_type` is a `String` with a `PROJECT_TYPE_NOVEL` const, not an enum. It
is the shape `Frontmatter.doc_type` and `Node::Item.kind` already have, and each
of those carries the same note: a name this version does not know is stored,
handed back, and left to the frontend. An enum would need a custom deserializer
so a hand-edited file still opens, and it closes the door F-082 wants open. The
settings picker copies that tolerance from `createLanguageSelect` — a type we do
not ship gets an option of its own rather than rendering the control blank.

There is no backfill. `language` has one because absent was lossy: `load` filled
`en` and `create_chapter` stamped it into files that kept it. Absent
`project_type` writes into nothing and already means novel, and a backfill in
`open_project` would stamp `modified` on the first open of every existing
project. What does happen is that `save()` reserializes the whole struct, so the
key appears in a project's `sietch.json` the next time any command writes — a
chapter created, a folder moved, a tag coloured. `format_version` does not move
for it. A reader ignoring a key it has never heard of is not a broken reader.

The picker records intent and nothing else until F-074. Choosing "Thesis" today
writes a string and changes nothing on screen. It is worth having anyway, because
it means projects are already tagged when the first type-scoped view lands.

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
