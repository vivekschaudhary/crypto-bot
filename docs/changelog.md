# Changelog

User-visible changes. One entry per shipped bet (not per PR — PRs accumulate, finalize when brief ships).

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Operator dashboard (CB-5) — MVP complete.** `/dashboard` now shows the bot's live state (session status, holdings + average cost from your real Coinbase fills, this-session activity) with a prominent paper/live (`LIVE_MODE`) banner; a decision-trace view (`/dashboard/trace`) explaining why the bot decided buy/sell/hold each tick (RSI/MA + reason per asset); a transaction ledger (`/dashboard/ledger`) of every order (paper + live, bot vs. manual) with per-asset realized + unrealized PnL; and **safe override controls** — pause, resume, and reset-session — on the live-state panel. Reset starts a fresh session while preserving your full transaction history. Controls are state-only (no real-money order placement); real-money overrides remain deferred until after the live-mode flip.

### Changed
- The bot session model is now multi-row: a reset ends the current session and starts a new one (history preserved), rather than re-anchoring a single row.

### Fixed
-

### Deprecated
-

### Removed
-

### Security
-

<!--
When a brief ships:
1. Move accumulated entries from Unreleased into a versioned section below
2. Start a fresh Unreleased section
3. Sprint comms (docs/sprints/<year>/sprint-<n>.md) lists all briefs shipped that sprint
-->
