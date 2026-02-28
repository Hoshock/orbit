# orbit - Offline Review Board In Terminal

## Project Overview

TUI code review tool that generates structured prompts from review comments.
Built with OpenTUI + React + Bun.

## Commands

- `bun run start` - Run the app
- `bun test` - Run tests
- `bun run lint` - Lint with Biome (auto-fix)
- `bun run check` - Lint + build check (no auto-fix)
- `bun run register` - Install `orbit` command globally via symlink

## Architecture

- Entry: `src/index.tsx` → CLI parse → renderer → `<App />`
- State: `useSyncExternalStore` pattern for comments (see `comment-store.ts`)
- Keyboard: `useKeyboard()` in `app.tsx` dispatches by `AppMode`
- Diff collapse: `collapseDiff()` in `diff-collapse.ts` folds unchanged sections
- Syntax highlighting: `syntaxStyle` from `theme.ts`, `filetype` from `filetype.ts`

## Key Patterns

- `<diff>` element for native diff rendering with tree-sitter highlighting
- `<textarea>` for comment input (handles its own keyboard)
- `<scrollbox>` for scrollable content
- `Bun.spawnSync` for git operations (no async shell, no user input in commands)
- Comment mode disables app-level keyboard (textarea owns input)
- Fold/unfold via `collapseDiff()` — pure function, no side effects

## Modes

file-list → diff-view → comment-input → comment-list → prompt-preview

## File Structure

```
src/
  index.tsx          Entry point, CLI help, renderer setup
  app.tsx            Main component, keyboard dispatch, state
  types.ts           DiffFile, ReviewComment, AppMode, CliOptions
  cli/
    args.ts          CLI argument parsing
  components/
    home-screen.tsx  File tree + diff preview (resizable split)
    file-tree.tsx    File tree with directory collapsing
    file-list.tsx    Flat file list (legacy)
    diff-view.tsx    Full diff viewer with cursor/comments
    diff-preview.tsx Read-only diff preview for home screen
    comment-form.tsx Comment input form
    comment-list.tsx Comment list view
    prompt-preview.tsx Prompt preview + clipboard copy
    header.tsx       Top bar
    help-bar.tsx     Bottom help bar
  data/
    diff-parser.ts   Git diff parsing, line mapping
    diff-collapse.ts Fold/unfold logic for long context sections
    comment-store.ts In-memory comment store (useSyncExternalStore)
    prompt-formatter.ts Comment → prompt text
  utils/
    file-tree.ts     Tree building from flat file paths
    git.ts           Git shell helpers
    clipboard.ts     Clipboard access (pbcopy/xclip)
    filetype.ts      Extension → language name mapping
  theme.ts           Syntax highlighting theme definition
```

## Testing

Tests in `src/__tests__/`. Uses `bun:test`.
All git operations use `Bun.spawnSync` — no shell injection risk.
