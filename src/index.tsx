import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app.tsx";
import { buildDiffArgs, parseArgs } from "./cli/args.ts";
import { parseDiffFiles } from "./data/diff-parser.ts";
import { getRepoRoot, resolveShortHash } from "./utils/git.ts";

let renderer: CliRenderer;

export function shutdown() {
  renderer.destroy();
  process.nextTick(() => process.exit(0));
}

const HELP = `orbit - Offline Review Board In Terminal

Usage:
  orbit                   unstaged changes (git diff)
  orbit .                 same as above
  orbit staged            staged changes (git diff --staged)
  orbit HEAD              last commit (HEAD~1..HEAD)
  orbit HEAD~3..HEAD      commit range
  orbit feature main      branch comparison

Options:
  --split, --mode=split   split view (default: unified)
  -h, --help              show this help

Keybindings:
  file-list:  \u2191\u2193 move  Enter open diff  Space toggle viewed
              c file comment  C comment list  P prompt preview
              t split/unified  q quit
  diff-view:  \u2191\u2193 move lines  Shift+\u2191\u2193 select range
              c comment on line  f file comment  z fold/unfold
              t split/unified  Esc back
  comment:    Ctrl+Enter submit  Esc cancel
  comments:   Enter jump  e edit  d delete  Esc back
  prompt:     y copy to clipboard  Esc back

Workflow:
  1. Open diff with orbit HEAD (or other range)
  2. Browse files with arrow keys, Enter to view diff
  3. Navigate diff lines, press c to add review comments
  4. Press P to preview all comments as a prompt
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

  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    useMouse: true,
  });

  createRoot(renderer).render(<App files={files} options={options} />);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
