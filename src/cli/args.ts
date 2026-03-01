import type { CliOptions } from "../types.ts";

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const splitMode = false;
  let staged = false;
  let root = false;

  // Extract flags
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--staged") {
      staged = true;
    } else if (arg === "--root") {
      root = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  // --staged → staged changes
  if (staged) {
    return { base: "--staged", target: "", splitMode, root };
  }

  // No args or "." → unstaged changes
  if (
    positional.length === 0 ||
    (positional.length === 1 && positional[0] === ".")
  ) {
    return { base: "", target: "", splitMode, root };
  }

  // Single arg with ".." → range (e.g., HEAD~3..HEAD)
  if (positional.length === 1) {
    const range = positional[0]!;
    if (range.includes("..")) {
      const [base, target] = range.split("..");
      return { base: base!, target: target || "HEAD", splitMode, root };
    }
    // Single ref like "HEAD" → diff against parent
    return { base: `${range}~1`, target: range, splitMode, root };
  }

  // Two args → branch comparison (e.g., feature main)
  return { base: positional[1]!, target: positional[0]!, splitMode, root };
}

export function buildDiffArgs(options: CliOptions): string[] {
  if (options.base === "--staged") {
    return ["diff", "--staged"];
  }
  if (options.base === "" && options.target === "") {
    return ["diff"];
  }
  return ["diff", `${options.base}..${options.target}`];
}

export function formatDiffRange(options: CliOptions): string {
  if (options.base === "--staged") return "staged changes";
  if (options.base === "" && options.target === "") return "unstaged changes";
  return `${options.base}..${options.target}`;
}
