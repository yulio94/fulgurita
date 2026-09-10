# 1. Plain English feature names

- Date: 2026-09-10
- Status: Accepted
- Linear: SIE-100, SIE-101, SIE-102

## Context

The product name and most of the feature names came from Frank Herbert's Dune.
About fifteen terms in all, two of them attached to paid services — Guild
Navigator for sync and version history, Truthsayer for the AI analysis. The
risk came from the number of terms rather than from any single one.

SIE-100 proposed moving the product to `Wuj`, the K'iche' word for book, to
remove that exposure. SIE-101 was the verification step and it inverted the
premise. `WUJ` has a live USPTO registration in Class 009 with proven use since
2020. `SIETCH` has nothing in Class 009 or Class 042. Renaming would have traded
a term with no registered conflict for one that has a live one.

## Decision

Sietch stays as the product name. We remove the Dune vocabulary from everything
else: feature names, phase names, and the strings a user reads.

That takes the pattern from fifteen terms down to one.

## What changes

Phases:

| Before | After |
|--|--|
| The Spice Must Flow | Foundation |
| Desert Power | Daily Writing |
| The Golden Path | Structure & Output |
| The Kwisatz Haderach | Sync & Intelligence |

Features. The F-number is fixed and travels with the feature through the rename:

| ID | Before | After |
|--|--|--|
| F-010 | Arrakis Night theme | Dark theme |
| F-023 | Bene Gesserit Notes | Notes |
| F-024 | Spice Counter | Word count |
| F-025 | Arrakis Day theme | Light theme |
| F-027 | Sandworm Search | Full-text search |
| F-041 | Mentat Mode | Outline view |
| F-042 | Stillsuit Mode | Focus mode |
| F-044 | Water Discipline | Writing goals |
| F-045 | Litany streaks | Writing streaks |
| F-046 | CHOAM Ledger | Statistics dashboard |
| F-060 | Encyclopædia | Encyclopedia |
| F-063 | Guild Navigator — Git | Version history — Git |
| F-064 | Guild Navigator — Cloud | Sync — Cloud |
| F-066 | Truthsayer — Pacing | Pacing analysis |
| F-071 | Other Memory | Document query |
| F-073 | Spice Vision | View switcher |
| F-074 | Códex view | Codex view |
| F-082 | Fremkit plugins | Plugins |

UI strings, which SIE-104 lands in `src/i18n/en/index.ts` and `src/i18n/es/index.ts`:

| Key | Before (en) | After (en) |
|--|--|--|
| `themeDay` | Arrakis Day | Light |
| `themeNight` | Arrakis Night | Dark |
| `focusModeLabel` | Sietch Mode | Focus Mode |
| `welcomeSubtitle` | Your desert writing refuge | — |

The `es` locale carries the same four keys. `welcomeSubtitle` needs a
replacement line rather than a translation of the old one, so SIE-104 decides it.

## What stays

- `Sietch` — product name, window title, the brand in the titlebar
- `sietch.json` and `.sietch/` — the on-disk project format
- `sietch:` — the marker namespace in chapter `.md` files
- `sietch_lib` — the Rust crate
- `sietch.app` — the bundle identifier
- The repository name, `Cargo.toml`, `package.json`
- `SIE-` issue keys and `F-` feature numbers

## Accepted risk

We did not consult an IP lawyer. `Sietch` is a word Herbert coined, so a
copyright claim over the term is possible in a way it would not be for an
ordinary English noun. The trademark search came back clean in Classes 009 and
042 and we stopped there. SIE-101 records this as a decision we made knowingly.

## Follow-up

- SIE-103 was cancelled: the rebrand is gone, so nothing on disk moves. SIE-104 did the code. SIE-105 does the repository and the Linear titles.
- Test fixtures across the Rust and TypeScript suites used Dune sample text. They are not shipped strings, so the decision was SIE-104's: it replaced them, in a commit of its own.
- The Linear project names still carry the old phase names. SIE-105 renames them, and `FEATURES.md` quotes them as they stand until it does.
- `B'atz'` and `No'j` were proposed names for the sync and AI services. They lost their context when the rebrand was dropped and no replacement is chosen. The services do not exist yet, so this can wait.
