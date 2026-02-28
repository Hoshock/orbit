import { describe, expect, it } from "bun:test";
import { buildDiffArgs, formatDiffRange, parseArgs } from "../cli/args.ts";

describe("parseArgs", () => {
  const argv = (args: string[]) => ["node", "orbit", ...args];

  it("no args → unstaged changes", () => {
    expect(parseArgs(argv([]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
    });
  });

  it('"." → unstaged changes', () => {
    expect(parseArgs(argv(["."]))).toEqual({
      base: "",
      target: "",
      splitMode: false,
    });
  });

  it('"staged" → staged changes', () => {
    expect(parseArgs(argv(["staged"]))).toEqual({
      base: "--staged",
      target: "",
      splitMode: false,
    });
  });

  it('"HEAD" → diff against parent', () => {
    expect(parseArgs(argv(["HEAD"]))).toEqual({
      base: "HEAD~1",
      target: "HEAD",
      splitMode: false,
    });
  });

  it('"HEAD~3..HEAD" → range', () => {
    expect(parseArgs(argv(["HEAD~3..HEAD"]))).toEqual({
      base: "HEAD~3",
      target: "HEAD",
      splitMode: false,
    });
  });

  it('"main..feature" → range with explicit target', () => {
    expect(parseArgs(argv(["main..feature"]))).toEqual({
      base: "main",
      target: "feature",
      splitMode: false,
    });
  });

  it('"abc123.." → range with implicit HEAD target', () => {
    expect(parseArgs(argv(["abc123.."]))).toEqual({
      base: "abc123",
      target: "HEAD",
      splitMode: false,
    });
  });

  it('"feature main" → branch comparison (target first, base second)', () => {
    expect(parseArgs(argv(["feature", "main"]))).toEqual({
      base: "main",
      target: "feature",
      splitMode: false,
    });
  });

  it("--split flag", () => {
    expect(parseArgs(argv(["HEAD", "--split"]))).toEqual({
      base: "HEAD~1",
      target: "HEAD",
      splitMode: true,
    });
  });

  it("--mode=split flag", () => {
    expect(parseArgs(argv(["--mode=split"]))).toEqual({
      base: "",
      target: "",
      splitMode: true,
    });
  });

  it("unknown flags are ignored", () => {
    expect(parseArgs(argv(["--unknown", "HEAD"]))).toEqual({
      base: "HEAD~1",
      target: "HEAD",
      splitMode: false,
    });
  });
});

describe("buildDiffArgs", () => {
  it("staged", () => {
    expect(
      buildDiffArgs({ base: "--staged", target: "", splitMode: false }),
    ).toEqual(["diff", "--staged"]);
  });

  it("unstaged", () => {
    expect(buildDiffArgs({ base: "", target: "", splitMode: false })).toEqual([
      "diff",
    ]);
  });

  it("range", () => {
    expect(
      buildDiffArgs({ base: "HEAD~1", target: "HEAD", splitMode: false }),
    ).toEqual(["diff", "HEAD~1..HEAD"]);
  });
});

describe("formatDiffRange", () => {
  it("staged", () => {
    expect(
      formatDiffRange({ base: "--staged", target: "", splitMode: false }),
    ).toBe("staged changes");
  });

  it("unstaged", () => {
    expect(formatDiffRange({ base: "", target: "", splitMode: false })).toBe(
      "unstaged changes",
    );
  });

  it("range", () => {
    expect(
      formatDiffRange({ base: "HEAD~1", target: "HEAD", splitMode: false }),
    ).toBe("HEAD~1..HEAD");
  });
});
