# crev - TUI Code Review Tool

## Project Overview

TUI-based code review tool that generates Claude Code prompts from review comments.
Built with OpenTUI + React + Bun.

## Commands

- `bun run start` - Run the app
- `bun run lint` - Lint with Biome
- `bun run check` - Lint + build check
- `bun run register` - Install `crev` command globally

## Architecture

- Entry: `src/index.tsx` → CLI parse → renderer → `<App />`
- State: `useSyncExternalStore` pattern for comments (see `comment-store.ts`)
- Persistence: JSON files in `~/.local/share/crev/<repoHash>/`
- Keyboard: `useKeyboard()` in `app.tsx` dispatches by `AppMode`

## Key Patterns

- `<diff>` element for native diff rendering with tree-sitter highlighting
- `<textarea>` for comment input (handles its own keyboard)
- `<scrollbox>` for scrollable content
- `Bun.spawnSync` for git operations
- Comment mode disables app-level keyboard (textarea owns input)

## Modes

file-list → diff-view → comment-input → comment-list → prompt-preview
