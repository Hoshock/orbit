# Changelog

All notable changes to this project are documented here.

## v0.2.6 - 2026-03-05

### Added

- Directory-level `viewed` toggling now marks all descendant files in one action.
- A tag-based `CHANGELOG.md` structure was introduced with `Added` / `Updated` / `Fixed` sections.

### Updated

- Directory rows now express `viewed` state by color only instead of showing a checkmark.
- The instruction-doc link direction was reversed so `CLAUDE.md` points to `AGENTS.md`.
- Agent guidance now explicitly includes `CHANGELOG.md` maintenance expectations.

### Fixed

- Pressing `v` on a viewed directory now cleanly unmarks all descendant files on the second toggle.
- Directory viewed-state propagation now stays consistent when descendant files are toggled individually.

## v0.2.5 - 2026-03-05

### Added

- A fold-all action was introduced to fully reveal hidden sections in one step.
- Incremental fold expansion size became configurable.

### Updated

- Fold key handling was refined to support both step-based and full expansion flows.

### Fixed

- Fold targeting around marker rows was stabilized.
- Repeated fold/unfold navigation now behaves consistently.

## v0.2.4 - 2026-03-05

### Added

### Updated

- The lazygit entry path was simplified for selected-file review.
- Path-filter handling in comparison flows was tightened.

### Fixed

- Untracked diff behavior is now stable when filters are combined.
- Selected untracked files are no longer skipped in edge cases.

## v0.2.3 - 2026-03-03

### Added

- Regression tests were added for split-side switching on padded rows.

### Updated

- Split-view side switching now remaps to the nearest valid row.
- Cursor state synchronization between header and diff view was improved.

### Fixed

- Side switching no longer leaves the cursor on non-source padding rows.

## v0.2.2 - 2026-03-02

### Added

- Additional regression coverage was added for split-click cursor placement.

### Updated

- Config persistence flow was adjusted to preserve defaults more reliably.

### Fixed

- Split-mode click handling was hardened for side-aware cursor placement.
- Config default preservation regressions during preference saves were resolved.

## v0.2.1 - 2026-03-02

### Added

- Session persistence was unified for comments, viewed files, and UI preferences.
- Page-scoped keybinding configuration sections were introduced.

### Updated

- Session cache structure was normalized to keep comment/viewed/pref state in one flow.

### Fixed

## v0.2.0 - 2026-03-02

### Added

- Viewed flags were introduced for quick review-progress tracking.
- Visual fold markers and incremental unfold behavior were added.

### Updated

- Documentation and demo assets were updated for fold/viewed workflows.

### Fixed

- Unfold scrolling stability was improved after fold state changes.
- Split diff line-color restoration was fixed when cursor highlighting moved.

## v0.1.0 - 2026-03-01

### Added

- The first terminal-first review experience shipped with file tree navigation and diff views.
- Inline comments and AI prompt-export workflow were included in the initial release.
- Syntax highlighting and fold/unfold capabilities were included from the early milestone.
- Project branding assets and screenshots were introduced.

### Updated

- README structure and product wording were revised to match the evolving UI.
- Keybinding documentation was repeatedly synchronized with actual behavior.
- Visual assets and layout details were refined across the initial iterations.

### Fixed

- Outdated keybinding documentation mismatches were corrected.
- Scroll jump issues after commenting were fixed.
- Split-mode side filtering and related diff behavior were stabilized.
