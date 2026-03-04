import type { CliOptions } from "../types.ts";

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const splitMode = false;
  let staged = false;
  let root = false;
  let includeUntracked = false;

  // Split on `--` separator: before = flags/positional, after = file paths
  const dashDashIdx = args.indexOf("--");
  const beforeDash = dashDashIdx >= 0 ? args.slice(0, dashDashIdx) : args;
  const paths =
    dashDashIdx >= 0 ? args.slice(dashDashIdx + 1).filter(Boolean) : [];

  // Extract flags
  const positional: string[] = [];
  for (const arg of beforeDash) {
    if (arg.trim().length === 0) continue;
    if (arg === "--staged") {
      staged = true;
    } else if (arg === "--root") {
      root = true;
    } else if (arg === "--include-untracked") {
      includeUntracked = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  // --staged → staged changes
  if (staged) {
    return {
      base: "--staged",
      target: "",
      splitMode,
      root,
      includeUntracked,
      paths,
    };
  }

  // No args or "." → unstaged changes
  if (
    positional.length === 0 ||
    (positional.length === 1 && positional[0] === ".")
  ) {
    return { base: "", target: "", splitMode, root, includeUntracked, paths };
  }

  // Single arg with ".." → range (e.g., HEAD~3..HEAD)
  if (positional.length === 1) {
    const arg = positional[0]!;
    if (arg.includes("..")) {
      const [base, target] = arg.split("..");
      return {
        base: base!,
        target: target || "HEAD",
        splitMode,
        root,
        includeUntracked,
        paths,
      };
    }
    // Single ref like "HEAD" → diff against parent
    return {
      base: `${arg}~1`,
      target: arg,
      splitMode,
      root,
      includeUntracked,
      paths,
    };
  }

  // Two args → branch comparison (e.g., feature main)
  return {
    base: positional[1]!,
    target: positional[0]!,
    splitMode,
    root,
    includeUntracked,
    paths,
  };
}

export function buildDiffArgs(options: CliOptions): string[] {
  if (options.base === "--staged") {
    return ["diff", "--staged"];
  }
  if (options.base === "" && options.target === "") return ["diff"];
  return ["diff", `${options.base}..${options.target}`];
}

export function formatDiffRange(options: CliOptions): string {
  if (options.base === "--staged") return "staged changes";
  if (options.base === "" && options.target === "") return "unstaged changes";
  return `${options.base}..${options.target}`;
}
