import { describe, expect, it } from "bun:test";
import { collapseDiff } from "../data/diff-collapse.ts";

const HEADER = [
  "diff --git a/file.ts b/file.ts",
  "index abc..def 100644",
  "--- a/file.ts",
  "+++ b/file.ts",
].join("\n");

function makeDiff(hunkContent: string): string {
  return `${HEADER}\n${hunkContent}`;
}

function ctxLines(start: number, count: number): string {
  return Array.from({ length: count }, (_, i) => ` line${start + i}`).join(
    "\n",
  );
}

describe("collapseDiff", () => {
  it("returns original diff when no foldable zones exist", () => {
    const diff = makeDiff(
      `@@ -1,5 +1,6 @@\n line1\n line2\n-old\n+new\n line3\n line4`,
    );
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(0);
    expect(result.diff).toBe(diff);
  });

  it("folds a long context zone (10 lines)", () => {
    // 3 ctx + change + 10 ctx + change + 3 ctx
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(1);
    expect(result.folds[0]!.id).toBe(0);
    expect(result.folds[0]!.hiddenCount).toBe(4); // 10 - 3*2 = 4

    // The collapsed diff should have fewer lines
    const collapsedLines = result.diff.split("\n");
    const origLines = diff.split("\n");
    expect(collapsedLines.length).toBeLessThan(origLines.length);

    // Should contain fold annotation
    expect(result.diff).toContain("4 lines hidden");
  });

  it("preserves context around changes", () => {
    // 3 ctx + change + 10 ctx + change + 3 ctx
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    // First 3 context lines after change should be kept
    expect(result.diff).toContain(" line5");
    expect(result.diff).toContain(" line6");
    expect(result.diff).toContain(" line7");

    // Last 3 context lines before next change should be kept
    expect(result.diff).toContain(" line12");
    expect(result.diff).toContain(" line13");
    expect(result.diff).toContain(" line14");

    // Middle lines should be hidden
    expect(result.diff).not.toContain(" line9");
    expect(result.diff).not.toContain(" line10");
  });

  it("expands a fold when its ID is in the expanded set", () => {
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);

    const collapsed = collapseDiff(diff, new Set());
    expect(collapsed.diff).toContain("lines hidden");

    const expanded = collapseDiff(diff, new Set([0]));
    // All context lines should be present when expanded
    expect(expanded.diff).toContain(" line9");
    expect(expanded.diff).toContain(" line10");
    expect(expanded.diff).not.toContain("lines hidden");
  });

  it("handles multiple foldable zones", () => {
    // change + 10 ctx + change + 10 ctx + change
    const hunk =
      `@@ -1,24 +1,24 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(13, 10)}\n` +
      `-old3\n+new3`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(2);
    expect(result.folds[0]!.id).toBe(0);
    expect(result.folds[1]!.id).toBe(1);
  });

  it("does not fold zones smaller than 7 lines", () => {
    // change + 6 ctx (not foldable) + change
    const hunk =
      `@@ -1,10 +1,10 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 6)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(0);
    expect(result.diff).toBe(diff);
  });

  it("folds exactly 7 context lines (minimum)", () => {
    const hunk =
      `@@ -1,11 +1,11 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 7)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(1);
    expect(result.folds[0]!.hiddenCount).toBe(1); // 7 - 6 = 1
  });

  it("generates valid unified diff with correct hunk headers", () => {
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    // All hunk headers should have valid format
    const hunkHeaders = result.diff
      .split("\n")
      .filter((l) => l.startsWith("@@"));
    for (const h of hunkHeaders) {
      expect(h).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/);
    }
  });

  it("returns empty folds for diff without hunks", () => {
    const diff = "some text without any @@ markers";
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(0);
    expect(result.diff).toBe(diff);
  });

  it("folds leading context (before first change)", () => {
    // 10 ctx + change + 3 ctx
    const hunk =
      `@@ -1,14 +1,14 @@\n` +
      `${ctxLines(1, 10)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(12, 3)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(1);
    // Top 3 kept, bottom 3 kept, middle 4 hidden
    expect(result.diff).toContain(" line1");
    expect(result.diff).toContain(" line3");
    expect(result.diff).not.toContain(" line5");
    expect(result.diff).toContain(" line8");
    expect(result.diff).toContain(" line10");
  });

  it("folds trailing context (after last change)", () => {
    // 3 ctx + change + 10 ctx
    const hunk =
      `@@ -1,14 +1,14 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    expect(result.folds).toHaveLength(1);
    // First 3 after change should be kept
    expect(result.diff).toContain(" line5");
    expect(result.diff).toContain(" line7");
    // Middle lines should be hidden
    expect(result.diff).not.toContain(" line9");
    // Last 3 (bottom context) should be kept
    expect(result.diff).toContain(" line12");
    expect(result.diff).toContain(" line14");
  });

  it("tracks source line ranges in folds", () => {
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Set());

    expect(result.folds[0]!.newLineStart).toBe(5);
    expect(result.folds[0]!.newLineEnd).toBe(14);
  });
});
