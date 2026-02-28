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

export function getRemoteUrl(): string | null {
  try {
    return runGit(["config", "--get", "remote.origin.url"]).trim();
  } catch {
    return null;
  }
}
