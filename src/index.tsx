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
import {
  getCachePath,
  getPrefsCachePath,
  getViewedCachePath,
  loadComments,
  loadPrefs,
  loadViewedFiles,
} from "./data/comment-cache.ts";
import { commentStore } from "./data/comment-store.ts";
import { parseDiffFiles } from "./data/diff-parser.ts";
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
  orbit --split           side-by-side view
  orbit --root SHA~1..SHA diff against empty tree if base is unresolvable

Options:
  --staged                staged changes
  --root                  diff against empty tree if base ref is unresolvable
  --split, --mode=split   split view (default: unified)
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
    files = parseDiffFiles(diffArgs, repoRoot);
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

  // Restore cached comments from previous session
  const cachePath = getCachePath(repoRoot, options.base, options.target);
  const cached = loadComments(cachePath);
  if (cached.length > 0) {
    commentStore.loadFromCache(cached);
  }
  commentStore.setCachePath(cachePath);

  // Restore cached viewed files
  const viewedCachePath = getViewedCachePath(
    repoRoot,
    options.base,
    options.target,
  );
  const cachedViewed = loadViewedFiles(viewedCachePath);

  // Restore cached preferences (tree width, etc.)
  const prefsCachePath = getPrefsCachePath(
    repoRoot,
    options.base,
    options.target,
  );
  const cachedPrefs = loadPrefs(prefsCachePath);

  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    useMouse: true,
  });

  createRoot(renderer).render(
    <App
      files={files}
      options={options}
      initialViewedFiles={cachedViewed}
      viewedCachePath={viewedCachePath}
      initialPrefs={cachedPrefs}
      prefsCachePath={prefsCachePath}
      onQuit={shutdown}
    />,
  );
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
