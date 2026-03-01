import { describe, expect, it } from "bun:test";
import {
  collapseDiff,
  FOLD_CHUNK_SIZE,
  FOLD_MARKER_PATTERN,
} from "../data/diff-collapse.ts";

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
    const result = collapseDiff(diff, new Map());

    expect(result.folds).toHaveLength(0);
    expect(result.diff).toBe(diff);
    expect(result.markerLines.size).toBe(0);
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
    const result = collapseDiff(diff, new Map());

    expect(result.folds).toHaveLength(1);
    expect(result.folds[0]!.id).toBe(0);
    expect(result.folds[0]!.hiddenCount).toBe(4); // 10 - 3*2 = 4

    // The collapsed diff should have fewer lines
    const collapsedLines = result.diff.split("\n");
    const origLines = diff.split("\n");
    expect(collapsedLines.length).toBeLessThan(origLines.length);

    // Should contain fold marker line
    expect(result.diff).toContain("4 lines hidden");
    expect(result.diff).toContain(FOLD_MARKER_PATTERN);
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
    const result = collapseDiff(diff, new Map());

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

  it("expands a fold when revealed >= hiddenCount", () => {
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);

    const collapsed = collapseDiff(diff, new Map());
    expect(collapsed.diff).toContain("lines hidden");

    // hiddenCount is 4, so revealing 4 lines fully expands
    const expanded = collapseDiff(diff, new Map([[0, 4]]));
    // All context lines should be present when expanded
    expect(expanded.diff).toContain(" line9");
    expect(expanded.diff).toContain(" line10");
    expect(expanded.diff).not.toContain("lines hidden");
    expect(expanded.markerLines.size).toBe(0);
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
    const result = collapseDiff(diff, new Map());

    expect(result.folds).toHaveLength(2);
    expect(result.folds[0]!.id).toBe(0);
    expect(result.folds[1]!.id).toBe(1);
    expect(result.markerLines.size).toBe(2);
  });

  it("does not fold zones smaller than 7 lines", () => {
    // change + 6 ctx (not foldable) + change
    const hunk =
      `@@ -1,10 +1,10 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 6)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Map());

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
    const result = collapseDiff(diff, new Map());

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
    const result = collapseDiff(diff, new Map());

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
    const result = collapseDiff(diff, new Map());

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
    const result = collapseDiff(diff, new Map());

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
    const result = collapseDiff(diff, new Map());

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
    const result = collapseDiff(diff, new Map());

    expect(result.folds[0]!.newLineStart).toBe(5);
    expect(result.folds[0]!.newLineEnd).toBe(14);
  });
});

describe("fold markers", () => {
  it("inserts a visible marker line when folded", () => {
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Map());

    // Marker line should contain the hidden count and pattern
    const markerLine = result.diff
      .split("\n")
      .find((l) => l.includes(FOLD_MARKER_PATTERN));
    expect(markerLine).toBeDefined();
    expect(markerLine).toContain("4 lines hidden");
    expect(markerLine).toContain("z to expand");
  });

  it("tracks marker display line positions", () => {
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Map());

    expect(result.markerLines.size).toBe(1);
    // The marker should map to fold ID 0
    const foldId = [...result.markerLines.values()][0];
    expect(foldId).toBe(0);

    // The display line should be positive
    const displayLine = [...result.markerLines.keys()][0]!;
    expect(displayLine).toBeGreaterThan(0);
  });

  it("removes marker when fold is fully expanded", () => {
    const hunk =
      `@@ -1,18 +1,18 @@\n` +
      `${ctxLines(1, 3)}\n` +
      `-old1\n+new1\n` +
      `${ctxLines(5, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(16, 3)}`;
    const diff = makeDiff(hunk);

    // hiddenCount = 4
    const result = collapseDiff(diff, new Map([[0, 4]]));
    expect(result.markerLines.size).toBe(0);
    expect(result.diff).not.toContain("lines hidden");
  });

  it("handles multiple markers for multiple folds", () => {
    const hunk =
      `@@ -1,24 +1,24 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(13, 10)}\n` +
      `-old3\n+new3`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Map());

    expect(result.markerLines.size).toBe(2);
    const foldIds = [...result.markerLines.values()];
    expect(foldIds).toContain(0);
    expect(foldIds).toContain(1);
  });

  it("marker hunk has correct line numbers at fold boundary", () => {
    // change + 10 ctx (lines 2-11) + change
    // Hidden: lines 5-8 (4 lines)
    // Marker should be at old:5, new:5
    const hunk =
      `@@ -1,12 +1,12 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 10)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);
    const result = collapseDiff(diff, new Map());

    // Find the marker hunk header
    const markerHunkHeader = result.diff
      .split("\n")
      .find(
        (l, i, arr) =>
          l.startsWith("@@") && arr[i + 1]?.includes(FOLD_MARKER_PATTERN),
      );
    expect(markerHunkHeader).toBeDefined();
    // The marker should be positioned at the start of the hidden zone
    expect(markerHunkHeader).toMatch(/^@@ -5,1 \+5,1 @@$/);
  });
});

describe("incremental unfold", () => {
  it("reveals lines from the top of the fold gap", () => {
    // 20 context lines between changes → hiddenCount = 14
    const hunk =
      `@@ -1,24 +1,24 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 20)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);

    // Fully collapsed: lines 5-18 hidden (14 lines)
    const collapsed = collapseDiff(diff, new Map());
    expect(collapsed.folds[0]!.hiddenCount).toBe(14);
    expect(collapsed.diff).not.toContain(" line6");

    // Reveal 5 lines: lines 5-9 now visible, lines 10-18 still hidden
    const partial = collapseDiff(diff, new Map([[0, 5]]));
    expect(partial.diff).toContain(" line5");
    expect(partial.diff).toContain(" line9");
    expect(partial.diff).not.toContain(" line10");
    expect(partial.diff).toContain("9 lines hidden"); // 14 - 5 = 9

    // Marker should still exist
    expect(partial.markerLines.size).toBe(1);
  });

  it("shows reduced count in marker after partial expansion", () => {
    const hunk =
      `@@ -1,24 +1,24 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 20)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);

    const result = collapseDiff(diff, new Map([[0, 10]]));
    // hiddenCount = 14, revealed = 10, remaining = 4
    expect(result.diff).toContain("4 lines hidden");
    expect(result.markerLines.size).toBe(1);
  });

  it("fully expands when revealed equals hiddenCount", () => {
    const hunk =
      `@@ -1,24 +1,24 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 20)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);

    const result = collapseDiff(diff, new Map([[0, 14]]));
    expect(result.diff).not.toContain("lines hidden");
    expect(result.markerLines.size).toBe(0);
    // All lines should be visible
    for (let i = 2; i <= 21; i++) {
      expect(result.diff).toContain(` line${i}`);
    }
  });

  it("fully expands when revealed exceeds hiddenCount", () => {
    const hunk =
      `@@ -1,24 +1,24 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 20)}\n` +
      `-old2\n+new2`;
    const diff = makeDiff(hunk);

    // Reveal more than hidden → same as full expand
    const result = collapseDiff(diff, new Map([[0, 100]]));
    expect(result.markerLines.size).toBe(0);
    expect(result.diff).not.toContain("lines hidden");
  });

  it("supports mixed expansion states across multiple folds", () => {
    const hunk =
      `@@ -1,30 +1,30 @@\n` +
      `-old1\n+new1\n` +
      `${ctxLines(2, 10)}\n` +
      `-old2\n+new2\n` +
      `${ctxLines(13, 10)}\n` +
      `-old3\n+new3\n` +
      `${ctxLines(24, 4)}`;
    const diff = makeDiff(hunk);
    const collapsed = collapseDiff(diff, new Map());
    expect(collapsed.folds).toHaveLength(2);

    // Fold 0: partially expand, Fold 1: fully expand
    const mixed = collapseDiff(
      diff,
      new Map([
        [0, 2],
        [1, collapsed.folds[1]!.hiddenCount],
      ]),
    );

    // Fold 0 should still have a marker
    // Fold 1 should not have a marker
    expect(mixed.markerLines.size).toBe(1);
    const markerFoldId = [...mixed.markerLines.values()][0];
    expect(markerFoldId).toBe(0);
  });

  it("FOLD_CHUNK_SIZE is exported and positive", () => {
    expect(FOLD_CHUNK_SIZE).toBeGreaterThan(0);
    expect(typeof FOLD_CHUNK_SIZE).toBe("number");
  });
});
