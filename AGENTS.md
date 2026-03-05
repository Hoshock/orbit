# orbit

orbit is a terminal-first code review TUI for git diffs.
It supports file-tree navigation, unified/split diff views, inline comments, fold/unfold, and prompt export for AI coding workflows.

## Project Structure

### Tech Stack

| Layer                     | Technology      | Role                                      |
| ------------------------- | --------------- | ----------------------------------------- |
| Runtime / Package Manager | Bun             | app runtime, scripts, test runner, build  |
| UI Framework              | OpenTUI + React | terminal rendering, component/state model |
| Language                  | TypeScript      | application and test implementation       |
| Lint / Format             | Biome           | static checks and formatting              |

### Important Files

- `src/index.tsx`: CLI entrypoint (`parseArgs` -> diff parse -> renderer -> `<App />`)
- `src/app.tsx`: main app state, keyboard handling, mode transitions
- `src/components/diff-view.tsx`: diff rendering, cursor highlight, split/unified interactions
- `src/components/home-screen.tsx`: file tree + preview layout and tree panel width handling
- `src/components/help-bar.tsx`: mode-specific keybinding hints shown to users
- `src/data/diff-parser.ts`: display/source line mapping and split-row semantics
- `src/data/diff-collapse.ts`: fold/unfold generation and marker mapping
- `src/data/comment-store.ts`: in-memory comment state and mutations
- `src/data/persistence.ts`: session/cache/config path resolution and persistence logic
- `src/__tests__/tui.test.ts`: UI interaction regression tests (key/mouse/view behavior)
- `src/__tests__/diff-parser.test.ts`: parser and line-mapping regression tests
- `src/__tests__/diff-collapse.test.ts`: fold/unfold regression tests
- `src/__tests__/cli-help.test.ts`: `--help` output and ordering consistency tests
- `CHANGELOG.md`: release notes organized by tag with `Added` / `Updated` / `Fixed`

## Development

### Boundary

- MUST:
  - Keep `README` usage order, `--help` usage order, and help-bar labels consistent.
  - Update `CHANGELOG.md` for release/tag-facing changes using `Added`, `Updated`, and `Fixed` sections.
- NEVER:
  - Introduce behavior changes without matching regression tests.
  - Update only one of docs/help/UI labels when keybindings or commands change.

### Commands

```shell
bun run start      # Run orbit from source (local development launch)
bun run check      # Run Biome check + Bun build verification
bun test           # Execute all test suites
bun run lint       # Apply Biome fixes (write mode, includes unsafe fixes)
```

### Testing

- Run `bun run check` and `bun test` after every change.
- UI behavior changes must include/adjust tests in `src/__tests__/tui.test.ts`.
- Fold or diff parsing changes must include/adjust tests in:
  - `src/__tests__/diff-collapse.test.ts`
  - `src/__tests__/diff-parser.test.ts`
- Help text/keybinding changes must update:
  - `README.md`
  - `src/index.tsx` HELP text
  - `src/components/help-bar.tsx`
  - `src/__tests__/cli-help.test.ts`

### Completion Check

- Code changes are implemented and consistent with project behavior contracts.
- Required docs/help updates are included when user-facing behavior changes.
- `bun run check` passes.
- `bun test` passes.

## Lesson & Learn

- Mouse click + keyboard navigation can race in OpenTUI update timing; for cursor changes originating from click callbacks, prefer synchronous state flush (`flushSync`) before forcing intermediate render.
- In diff-view keyboard handling, call `key.preventDefault?.()` to avoid double-handling with focused renderables (e.g. `ScrollBoxRenderable`) that also process arrow keys.
- Split side switching (`left`/`right`) should not keep cursor on padded rows. Always remap to the nearest row that has real source on the target side; add regression tests for both `new-only -> left` and `old-only -> right`.
