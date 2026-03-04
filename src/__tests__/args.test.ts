import { describe, expect, it } from "bun:test";
import { buildDiffArgs, formatDiffRange, parseArgs } from "../cli/args.ts";

describe("parseArgs", () => {
  const argv = (args: string[]) => ["node", "orbit", ...args];

  it("no args → unstaged changes", () => {
    expect(parseArgs(argv([]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"." → unstaged changes', () => {
    expect(parseArgs(argv(["."]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it("empty arg (e.g. lazygit quoted empty SelectedPath) → unstaged changes", () => {
    expect(parseArgs(argv([""]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"--staged" → staged changes', () => {
    expect(parseArgs(argv(["--staged"]))).toEqual({
      base: "--staged",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"HEAD" → diff against parent', () => {
    expect(parseArgs(argv(["HEAD"]))).toEqual({
      base: "HEAD~1",
      target: "HEAD",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"HEAD~3..HEAD" → range', () => {
    expect(parseArgs(argv(["HEAD~3..HEAD"]))).toEqual({
      base: "HEAD~3",
      target: "HEAD",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"main..feature" → range with explicit target', () => {
    expect(parseArgs(argv(["main..feature"]))).toEqual({
      base: "main",
      target: "feature",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"abc123.." → range with implicit HEAD target', () => {
    expect(parseArgs(argv(["abc123.."]))).toEqual({
      base: "abc123",
      target: "HEAD",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"feature main" → branch comparison (target first, base second)', () => {
    expect(parseArgs(argv(["feature", "main"]))).toEqual({
      base: "main",
      target: "feature",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it("--root flag", () => {
    expect(parseArgs(argv(["--root", "HEAD~3..HEAD"]))).toEqual({
      base: "HEAD~3",
      target: "HEAD",
      splitMode: false,
      root: true,
      includeUntracked: false,
      paths: [],
    });
  });

  it("--staged takes precedence over positional args", () => {
    expect(parseArgs(argv(["--staged", "HEAD"]))).toEqual({
      base: "--staged",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it("unknown flags are ignored", () => {
    expect(parseArgs(argv(["--unknown", "HEAD"]))).toEqual({
      base: "HEAD~1",
      target: "HEAD",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it("--split is ignored", () => {
    expect(parseArgs(argv(["HEAD", "--split"]))).toEqual({
      base: "HEAD~1",
      target: "HEAD",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"-- file.ts" → unstaged with path filter', () => {
    expect(parseArgs(argv(["--", "file.ts"]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: ["file.ts"],
    });
  });

  it('"HEAD -- file.ts" → commit with path filter', () => {
    expect(parseArgs(argv(["HEAD", "--", "file.ts"]))).toEqual({
      base: "HEAD~1",
      target: "HEAD",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: ["file.ts"],
    });
  });

  it('"--staged -- a.ts b.ts" → staged with multiple paths', () => {
    expect(parseArgs(argv(["--staged", "--", "a.ts", "b.ts"]))).toEqual({
      base: "--staged",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: ["a.ts", "b.ts"],
    });
  });

  it('"--" alone → unstaged with empty paths', () => {
    expect(parseArgs(argv(["--"]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: false,
      paths: [],
    });
  });

  it('"--include-untracked -- file.ts" enables untracked injection', () => {
    expect(parseArgs(argv(["--include-untracked", "--", "file.ts"]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: true,
      paths: ["file.ts"],
    });
  });

  it('"--include-untracked" alone keeps normal unstaged diff', () => {
    expect(parseArgs(argv(["--include-untracked"]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
      root: false,
      includeUntracked: true,
      paths: [],
    });
  });
});

describe("buildDiffArgs", () => {
  it("staged", () => {
    expect(
      buildDiffArgs({
        base: "--staged",
        target: "",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: [],
      }),
    ).toEqual(["diff", "--staged"]);
  });

  it("unstaged", () => {
    expect(
      buildDiffArgs({
        base: "",
        target: "",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: [],
      }),
    ).toEqual(["diff"]);
  });

  it("range", () => {
    expect(
      buildDiffArgs({
        base: "HEAD~1",
        target: "HEAD",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: [],
      }),
    ).toEqual(["diff", "HEAD~1..HEAD"]);
  });

  it("with paths", () => {
    expect(
      buildDiffArgs({
        base: "",
        target: "",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: ["src/app.ts"],
      }),
    ).toEqual(["diff"]);
  });

  it("range with paths", () => {
    expect(
      buildDiffArgs({
        base: "HEAD~1",
        target: "HEAD",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: ["a.ts", "b.ts"],
      }),
    ).toEqual(["diff", "HEAD~1..HEAD"]);
  });
});

describe("formatDiffRange", () => {
  it("staged", () => {
    expect(
      formatDiffRange({
        base: "--staged",
        target: "",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: [],
      }),
    ).toBe("staged changes");
  });

  it("unstaged", () => {
    expect(
      formatDiffRange({
        base: "",
        target: "",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: [],
      }),
    ).toBe("unstaged changes");
  });

  it("range", () => {
    expect(
      formatDiffRange({
        base: "HEAD~1",
        target: "HEAD",
        splitMode: false,
        root: false,
        includeUntracked: false,
        paths: [],
      }),
    ).toBe("HEAD~1..HEAD");
  });
});
