# README audit

Date: 2026-09-14

Scope: `README.md`, `docs/adr/0001-plain-english-feature-names.md` and `LICENSE`, checked against the code in `src/` and `src-tauri/`, the test suites, `.github/workflows/ci.yml` and the Tauri config. `FEATURES.md` is internal. We used it to learn what is built and what is not, and we cite it where the README sends readers to it. We did not grade it as public documentation.

Reference: [Chuloo/mural](https://github.com/Chuloo/mural), for structure and honesty only. Its README has a tagline, platform and install requirements, a "what works today" section, a privacy and costs section, a planned-service section that marks paid features as not active, build and test commands with results, a code map table, and a license and dependencies section. It puts each limitation next to the feature it limits.

The README is 15 lines. It has four parts: two lines of positioning, a stack list, a one-line status, and the license.

## Test run by this audit

The repository publishes no test results, so we ran the suites ourselves on 2026-09-14 on macOS (Darwin 25.6), from commit `7d99845`:

- `pnpm test`: 23 files, 182 tests passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 95 tests passed, 0 failed.

Nothing was run on Windows or Linux. The app was not launched.

## Criteria

| # | Criterion | Verdict | Evidence | Gap |
|---|-----------|---------|----------|-----|
| 1 | Opening | partial | `README.md:3-4` names the category ("writing app for long-form manuscripts") and sets it against Scrivener and Ulysses with "portable data and no vendor lock-in". | The tension comes from a product comparison the code does not support yet (claim 1), and the README never says why plain files matter to someone writing a book. |
| 2 | What it is vs what it requires | missing | No OS list, though `src-tauri/tauri.conf.json:33` targets all bundle formats. No mention of accounts. No prerequisites, though building needs Node/pnpm, Rust, and WebKitGTK on Linux (`.github/workflows/ci.yml:19`). The repo has no git tags or GitHub releases. | A reader cannot tell which systems it runs on, that it needs no account, or that building from source is currently the only way to get it. |
| 3 | Current state vs roadmap | missing | `README.md:11-12` is one status line that points to `FEATURES.md`, which defers to a Linear team (`FEATURES.md:9-11`). | There is no public list of what works today, separate from what is planned. |
| 4 | Non-guarantees next to features | missing | The README describes no features, so it states no limitations. The real limits are documented only internally: quitting from the macOS Dock skips the autosave flush (`FEATURES.md:64`), the markdown round-trip is lossy in principle (`FEATURES.md:112`), the sidebar tree has no ARIA tree roles (`FEATURES.md:80`), and the titlebar and context menu icons are unchecked on Windows and Linux (`FEATURES.md:363-365`, `FEATURES.md:444-446`). | A reader has no way to learn any of these limits from public docs. |
| 5 | Privacy and data | missing | Nothing in the README says where data lives. In the code, a project folder holds `chapters/`, `notes/`, `trash/` and `.fulgurita/` (`src-tauri/src/commands/project.rs:8`). A SQLite file is created at `.fulgurita/fulgurita.db` (`src-tauri/src/db/init.rs:10-14`). Recent project paths, panel widths, collapsed folders and the chosen view go to the app data `config.json` (`src/services/config.ts:100`, `:128`, `:165`, `:173`, `:191`). On every launch, `index.html:5-10` loads fonts from `fonts.googleapis.com` and `fonts.gstatic.com`. CSP is disabled (`src-tauri/tauri.conf.json:28`). | The README does not say that the app makes a network request to Google at startup, or where project and app data are stored. |
| 6 | Planned services | missing | B'atz' and No'j are not mentioned in the README. The ADR says the names "lost their context" and that no replacement is chosen (`docs/adr/0001-plain-english-feature-names.md:119`), which contradicts the settled names. The same ADR describes two Dune terms as "attached to paid services" (`0001:10-11`), which reads as if those services exist. `FEATURES.md`, the only status link in the README, marks F-063, F-064 and F-066 to F-069 as "💰 Premium" (`FEATURES.md:285-291`) and opens the phase with "This is where monetization lives" (`FEATURES.md:278`), without saying they are not built or for sale. | Public docs do not say that sync and AI are planned paid services that do not exist and cannot be bought, and the one document the README links to presents them as priced tiers. |
| 7 | Code map | missing | The README has no directory table. `CLAUDE.md:42-72` has a tree, but it is written for agents and is out of date: it calls the frontend "vanilla TypeScript" (`CLAUDE.md:7`), says `main.ts` "seeds data" (`CLAUDE.md:46`), and leaves out `settings/`, `start-screen/`, `titlebar/`, `i18n/`, and the backend's `commands/`, `models/`, `db/`, `typeset.rs` and `watcher.rs`. | A newcomer has no current map from directories to what they contain. |
| 8 | Verification | missing | No dated statement of testing in any public doc. `FEATURES.md:3` has a "Last updated" date but makes no test claim. CI runs Biome, the frontend build, clippy and a release build on `ubuntu-24.04` only (`.github/workflows/ci.yml:11`, `:37-45`). It runs neither `pnpm test` nor `cargo test`, and never builds on macOS or Windows. | Nothing public tells a reader what was tested, on which platform, or when, and CI does not run the 277 tests that exist. |
| 9 | License and trademark | partial | `README.md:14-15` names AGPL-3.0, and `LICENSE:1-2` is the AGPL v3 text. There is no statement about the name or logo. `package.json` has no `license` field. `src-tauri/Cargo.toml:4-5` still has the template values `description = "A Tauri App"` and `authors = ["you"]`. | The docs do not say that "Fulgurita" and its logo identify the original project, or that AGPL grants no trademark rights. |

## Claims the code or tests do not support

1. **"A modern alternative to Scrivener and Ulysses"** (`README.md:4`). The core output path of both products is missing. `src-tauri/src/lib.rs:107-129` registers no export or compile command. `lib.rs:4-6` says the typesetting module exists for a future export (F-048) and print preview (F-078). PDF, DOCX and EPUB export are backlog (`FEATURES.md:244-246`). So are Scrivener import (`FEATURES.md:319`), the corkboard and outline views (`FEATURES.md:236-237`), full-text search (`FEATURES.md:152`), notes (`FEATURES.md:148`) and snapshots (`FEATURES.md:287`). Today a writer cannot get a finished manuscript out of the app as one document.

2. **"Portable data"** (`README.md:4`). The text is portable. The manuscript structure is not. Chapter files are named by UUID, `chapters/{id}.md` (`src-tauri/src/commands/chapter.rs:9-13`). Chapter order and folders exist only in the `tree` field of `fulgurita.json` (`src-tauri/src/models/project.rs:241`). Open the project folder in another editor and you get a flat directory of UUID-named files in no order. Paragraph styles are saved as `<!-- fulgurita:name -->` HTML comments (`src/services/chapters.ts:27-36`), which other editors show as raw comments or drop.

3. **"No vendor lock-in"** (`README.md:4`). This holds for the text of each chapter and for the open JSON format. It does not hold for the manuscript as a whole. Rebuilding the book outside Fulgurita means reading `fulgurita.json` yourself, because the app has no export (claim 1).

4. **"Vanilla JS"** (`README.md:7`). The frontend is TypeScript in strict mode. See `tsconfig.json`, the `tsc` step in the `build` script in `package.json`, and every source file under `src/` ending in `.ts`.

5. **"Project format: folders with `.md` files + metadata in `fulgurita.json`"** (`README.md:9`). This works differently from what it says. Chapter metadata (title, language, tags, synopsis) is YAML frontmatter inside each `.md` file (`src-tauri/src/models/frontmatter.rs:24-33`). `fulgurita.json` holds the tree, the trash log and tag colors (`src-tauri/src/models/project.rs:241`, `:249`, `:267`), plus project-level fields. The line leaves out `trash/`, `notes/`, and the SQLite database in `.fulgurita/` (`src-tauri/src/db/init.rs:14`).

6. **"Phase 1 — Foundation (MVP) in progress"** (`README.md:12`). This is stale. `FEATURES.md:30` lists 19 done and 0 in progress, and `FEATURES.md:84` says Phase 1 is closed. Work from later phases has shipped since: delete, rename, reorder, tags and synopsis (`FEATURES.md:145-155`), the file watcher (`src-tauri/src/watcher.rs`), the trash view, and the typesetting engine (`src-tauri/src/typeset.rs`, commit `3ad531c`).

7. **"See `FEATURES.md`"** (`README.md:12`). The only status link points readers to an internal document. That document says its status may be wrong and that a private Linear team is the source of truth (`FEATURES.md:9-11`).

8. **Stack list omits SQLite** (`README.md:6-9`). This is an omission, not a false claim, but it touches the design stance. The README does not mention SQLite or that it is meant to be a regenerable cache. In the code, `initialize_db` creates three tables (`src-tauri/src/db/init.rs:22-46`) on every create and open, and the connection is bound to `_conn` and dropped (`src-tauri/src/commands/project.rs:36`, `:71`). Nothing reads or writes those tables. The database exists on disk in every project and holds no data.

## Most urgent

1. **The Scrivener and Ulysses comparison** (claim 1). It is the second line a reader sees, and the app cannot export or import a manuscript. It sets an expectation the product misses on first use.
2. **No privacy or data section while the app contacts Google at launch** (criterion 5). A local-first writing app that makes an undisclosed third-party request on every start is the gap most likely to cost trust.
3. **Stale status that points to an internal doc with "💰 Premium" labels** (claims 6 and 7, criterion 6). Readers get an outdated phase and are sent to a table that presents unbuilt sync and AI features as priced tiers, with nothing saying they are not available.
