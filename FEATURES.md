# Sietch — Feature Tracker

> *"The spice must flow."*

Last updated: 2026-09-03

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

**11 Done · 2 In Progress · 6 Todo**

| ID | Linear | Feature | Description | Status |
|----|--------|---------|-------------|--------|
| — | SIE-1 | `chapter.rs` — persistence | Container block: `create_chapter`, `read_chapter`, `save_chapter`, `list_chapters` + `ChapterMeta`. Parent of F-006→F-009 | 🟢 Done |
| F-001 | SIE-2 | Create project | Generates a folder with `sietch.json`, `chapters/`, `notes/`, `.sietch/` | 🟢 Done |
| F-002 | SIE-3 | Open project | Native folder picker, reads `sietch.json` | 🟢 Done |
| F-003 | SIE-4 | Recent projects | Persisted list of the last projects opened. Blocks F-088 | 🔲 Todo |
| F-004 | SIE-5 | TipTap editor | StarterKit + Typography + CharacterCount + Placeholder | 🟢 Done |
| F-005 | SIE-6 | Sidebar tree | Renders a flat list today. Missing hierarchy and expand/collapse | 🟡 In Progress |
| F-006 | SIE-7 | Read chapter | Load a `.md` and render it in the editor | 🔲 Todo |
| F-007 | SIE-8 | Save chapter | Editor → markdown → disk | 🔲 Todo |
| F-008 | SIE-9 | Autosave | Every 30s, on chapter switch and on window close | 🔲 Todo |
| F-009 | SIE-10 | Create chapter | New `.md` + push to `chapter_order[]` | 🔲 Todo |
| F-010 | SIE-11 | Arrakis Night theme | Default dark theme | 🟢 Done |
| F-011 | SIE-12 | SQLite init | `writing_sessions`, `word_counts`, `project_meta` | 🟢 Done |
| F-012 | SIE-13 | Basic toolbar | Bold, italic, headings, blockquote, list, code | 🔲 Todo |
| F-013 | SIE-14 | i18n (en/es) | `typesafe-i18n` | 🟢 Done |
| F-014 | SIE-15 | Config persistence | `tauri-plugin-store` | 🟢 Done |
| F-015 | SIE-16 | Split panels | Draggable dividers, persisted width | 🟢 Done |
| F-016 | SIE-17 | Command palette | Cmd+K with `fuse.js` | 🟢 Done |
| F-017 | SIE-18 | Inspector panel | Inspection panel for the active document | 🟢 Done |
| F-088 | SIE-19 | Start screen | Exists, missing the recents list. Moved up from the backlog | 🟡 In Progress |

### Where Phase 1 stands

The backend now persists chapters — SIE-1 landed the four commands. The editor still runs on in-memory `seedDemoData`, so nothing reaches disk from the UI yet. That wiring is F-006/F-007.

**Suggested order:** drop `seedDemoData` → F-006/F-007 → F-008 → F-012 → F-003 → close out F-005 and F-088.

### Chapter storage

Chapter files are `chapters/{uuid}.md`. The title lives in YAML frontmatter, so `chapter_order[]` references a UUID that survives a rename (F-021):

```
---
title: Chapter One
---

Body text...
```

`word_count` and `modified` are derived on read, never stored. The `word_counts` table stays unused until F-024 needs session history.

`save_chapter` stores its `content` verbatim and never parses it — the HTML-vs-JSON decision below does not touch the backend.

### Open decisions

- **F-007:** does the editor send HTML or TipTap JSON? HTML is simpler to convert to markdown; JSON preserves the structure better. This constrains F-006.

---

## Phase 2 — "Desert Power"

**2 Done · 2 In Progress · 7 Backlog**

| ID | Linear | Feature | Description | Status |
|----|--------|---------|-------------|--------|
| F-020 | SIE-20 | Delete chapter | Soft delete to `trash/` | 🔲 Todo |
| F-021 | SIE-21 | Rename chapter | Rename the `.md` + update the reference | 🔲 Todo |
| F-022 | SIE-22 | Reorder chapters | Native drag & drop in the sidebar | 🔲 Todo |
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
