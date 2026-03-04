import { dirname, resolve } from "node:path";
import {
  addDefaultParsers,
  type CliRenderer,
  createCliRenderer,
} from "@opentui/core";
import { createRoot } from "@opentui/react";
import pythonHighlights from "../assets/tree-sitter/python/highlights.scm" with {
  type: "file",
};
import pythonWasm from "../assets/tree-sitter/python/tree-sitter-python.wasm" with {
  type: "file",
};
import { App } from "./app.tsx";
import { buildDiffArgs, parseArgs } from "./cli/args.ts";
import { commentStore } from "./data/comment-store.ts";
import { parseDiffFiles } from "./data/diff-parser.ts";
import {
  ensureOrbitConfig,
  getOrbitConfigPath,
  getSessionCachePath,
  loadSessionState,
} from "./data/persistence.ts";
import {
  getEmptyTreeHash,
  getRepoRoot,
  refExists,
  resolveShortHash,
} from "./utils/git.ts";

const __dir = dirname(new URL(import.meta.url).pathname);
addDefaultParsers([
  {
    filetype: "python",
    wasm: resolve(__dir, pythonWasm),
    queries: { highlights: [resolve(__dir, pythonHighlights)] },
  },
]);

let renderer: CliRenderer;

export function shutdown() {
  renderer.destroy();
  process.nextTick(() => process.exit(0));
}

const HELP = `orbit - Offline Review Board In Terminal

Usage:
  orbit                   unstaged changes (git diff)
  orbit .                 same as above
  orbit --staged          staged changes (git diff --staged)
  orbit HEAD              last commit (HEAD~1..HEAD)
  orbit HEAD~3..HEAD      commit range
  orbit feature main      branch comparison
  orbit -- file.ts        single file diff
  orbit HEAD -- file.ts   single file from commit range
  orbit --include-untracked -- file.ts
                          include selected untracked file(s)
  orbit --include-untracked .
                          include all untracked files in working tree
  orbit --root SHA~1..SHA diff against empty tree if base is unresolvable

Options:
  --staged                staged changes
  --root                  diff against empty tree if base ref is unresolvable
  --include-untracked     include untracked files (all, or limited by -- <path...>)
  -- <path...>            limit diff to specific file(s)
  -h, --help              show this help

Keybindings:
  file-list:  Esc/q quit  \u2191\u2193 move  \u2190\u2192 open/close  [] resize
              Enter open diff  c comment list  p prompt preview
              t split/unified  v toggle viewed
  diff-view:  \u2191\u2193 move lines  Shift+\u2191\u2193 select range
              \u2190\u2192 switch side (split)  c comment on line/selection
              d delete comment  e edit comment  f file comment
              t split/unified  v toggle viewed  z fold/unfold
              Esc/q back
  comment:    Ctrl+Enter submit  Esc cancel
  comments:   Enter jump  e edit  d delete  Esc back
  prompt:     y copy to clipboard  Esc back

Workflow:
  1. Open diff with orbit HEAD (or other range)
  2. Browse files with arrow keys, Enter to view diff
  3. Navigate diff lines, press c to add review comments
  4. Press p to preview all comments as a prompt
  5. Press y to copy the prompt to clipboard
  6. Paste into Claude Code or other AI tool for automated fixes`;

async function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log(HELP);
    process.exit(0);
  }

  const options = parseArgs(process.argv);
  const configPath = getOrbitConfigPath();
  const config = ensureOrbitConfig(configPath);
  options.splitMode = config.initialView === "split";

  let repoRoot: string;
  try {
    repoRoot = getRepoRoot();
  } catch {
    console.error("Error: Not a git repository");
    process.exit(1);
  }

  // --root: fall back to empty tree if base ref doesn't exist (root commit)
  if (options.root && options.base && options.base !== "--staged") {
    if (!refExists(options.base, repoRoot)) {
      options.base = getEmptyTreeHash(repoRoot);
    }
  }

  const diffArgs = buildDiffArgs(options);

  let files: ReturnType<typeof parseDiffFiles>;
  try {
    files = parseDiffFiles(
      diffArgs,
      repoRoot,
      options.paths,
      options.includeUntracked,
    );
  } catch (err) {
    console.error(`Error running git diff: ${err}`);
    process.exit(1);
  }

  // Resolve short hashes for prompt display
  options.oldHash = resolveShortHash(options.base, repoRoot);
  options.newHash = resolveShortHash(options.target || "HEAD", repoRoot);

  if (files.length === 0) {
    console.log("No changes found.");
    process.exit(0);
  }

  // Restore cached session state from previous session
  const sessionCachePath = getSessionCachePath(
    repoRoot,
    options.base,
    options.target,
  );
  const session = loadSessionState(sessionCachePath);
  if (session.comments.length > 0) {
    commentStore.loadFromCache(session.comments);
  }
  commentStore.setCachePath(sessionCachePath);

  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    useMouse: true,
  });

  createRoot(renderer).render(
    <App
      files={files}
      options={options}
      initialViewedFiles={session.viewedFiles}
      initialPrefs={session.prefs}
      sessionCachePath={sessionCachePath}
      config={config}
      configPath={configPath}
      onQuit={shutdown}
    />,
  );
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
