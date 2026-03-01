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

  it("shows current file-list keybindings", () => {
    const { stdout, exitCode } = run("--help");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("v toggle viewed");
    expect(stdout).toContain("c comment list");
    expect(stdout).toContain("p prompt preview");
    expect(stdout).not.toContain("Space toggle viewed");
  });

  it("keeps file-list keybinding order aligned with README/help-bar", () => {
    const { stdout, exitCode } = run("--help");

    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    const start = lines.findIndex((line) => line.includes("file-list:"));
    const end = lines.findIndex((line) => line.includes("diff-view:"));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const joined = lines.slice(start, end).join(" ");
    expect(joined).toMatch(
      /Enter open diff.*c comment list.*p prompt preview.*t split\/unified.*v toggle viewed/,
    );
  });

  it("shows usage commands in README order", () => {
    const { stdout, exitCode } = run("--help");

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(
      /orbit\s+unstaged changes.*orbit \.\s+same as above.*orbit --staged\s+staged changes.*orbit HEAD\s+last commit.*orbit HEAD~3\.\.HEAD\s+commit range.*orbit feature main\s+branch comparison.*orbit --split\s+side-by-side view.*orbit --root SHA~1\.\.SHA\s+diff against empty tree if base is unresolvable/s,
    );
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
