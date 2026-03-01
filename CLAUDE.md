# orbit (Offline Review Board In Terminal)

Terminal code-review TUI (OpenTUI + React + Bun).

## Commands

- `bun run start`
- `bun test`
- `bun run check`
- `bun run lint`

## Core Structure

- Entry: `src/index.tsx` (`parseArgs` -> git diff parse -> renderer -> `<App />`)
- Main state/keyboard: `src/app.tsx`
- Diff render/fold visuals: `src/components/diff-view.tsx`
- Fold/unfold + mapping: `src/data/diff-collapse.ts`, `src/data/diff-parser.ts`
- Comments store/cache: `src/data/comment-store.ts`, `src/data/comment-cache.ts`

## Important Behavior Contracts

- `README` usage order, `--help` usage order, and help-bar key labels must stay aligned.
- Fold/unfold (`z`) must keep cursor/scroll stable after expansion and while moving with keyboard.
- File-list and diff-view keybindings are part of the public UX; update tests when changing them.

## Testing Policy

- Always run `bun run check` and `bun test` after changes.
- UI behavior changes require regression tests in `src/__tests__/tui.test.ts`.
- Fold/parser logic changes require tests in `src/__tests__/diff-collapse.test.ts` or `src/__tests__/diff-parser.test.ts`.

## Docs Sync

- User-facing behavior changes: update `README.md`.
- Help text/keybinding changes: update `src/index.tsx` HELP, `src/components/help-bar.tsx`, and `src/__tests__/cli-help.test.ts`.
