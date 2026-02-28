export function getRepoRoot(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0) {
    throw new Error("Not a git repository");
  }
  return result.stdout.toString().trim();
}

export function runGit(args: string[], cwd?: string): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: cwd ?? process.cwd(),
  });
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
  return result.stdout.toString();
}

/** Resolve a ref to a short hash. Returns the ref itself on failure (e.g. unstaged). */
export function resolveShortHash(ref: string, cwd?: string): string {
  if (!ref || ref === "--staged") return ref;
  try {
    return runGit(["rev-parse", "--short", ref], cwd).trim();
  } catch {
    return ref;
  }
}
