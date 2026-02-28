import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname!, "../..");

function run(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`bun run src/index.tsx ${args}`, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 5000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

describe("orbit --help", () => {
  it("prints help and exits 0", () => {
    const { stdout, exitCode } = run("--help");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("orbit - Offline Review Board In Terminal");
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("Keybindings:");
    expect(stdout).toContain("Ctrl+Enter submit");
    expect(stdout).toContain("Workflow:");
  });

  it("-h also prints help", () => {
    const { stdout, exitCode } = run("-h");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
  });

  it("exits 0 with 'No changes found' for empty diff range", () => {
    const { stdout, exitCode } = run("HEAD..HEAD");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No changes found");
  });
});
