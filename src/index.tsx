import { type CliRenderer, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app.tsx";
import { buildDiffArgs, formatDiffRange, parseArgs } from "./cli/args.ts";
import { makeStorageKey } from "./data/comment-storage.ts";
import { commentStore } from "./data/comment-store.ts";
import { parseDiffFiles } from "./data/diff-parser.ts";
import { getRepoRoot } from "./utils/git.ts";

let renderer: CliRenderer;

export function shutdown() {
  renderer.destroy();
  process.nextTick(() => process.exit(0));
}

async function main() {
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

  if (files.length === 0) {
    console.log("No changes found.");
    process.exit(0);
  }

  // Initialize comment storage
  const storageKey = makeStorageKey(repoRoot, formatDiffRange(options));
  commentStore.init(storageKey);

  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
  });

  createRoot(renderer).render(<App files={files} options={options} />);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
