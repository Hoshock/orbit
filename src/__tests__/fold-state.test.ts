import { describe, expect, it } from "bun:test";
import { collapseDiff } from "../data/diff-collapse.ts";
import { getFoldTransition } from "../data/fold-state.ts";

function makeFoldHeavyDiff(): string {
  const header = [
    "diff --git a/file.ts b/file.ts",
    "index abc..def 100644",
    "--- a/file.ts",
    "+++ b/file.ts",
  ].join("\n");
  const ctx = Array.from({ length: 40 }, (_, i) => ` line${5 + i}`).join("\n");
  const hunk =
    "@@ -1,46 +1,46 @@\n" +
    " line1\n line2\n line3\n" +
    "-old1\n+new1\n" +
    `${ctx}\n` +
    "-old2\n+new2\n" +
    " line45\n line46\n line47";
  return `${header}\n${hunk}`;
}

function makeMultiFoldDiff(): string {
  const header = [
    "diff --git a/file.ts b/file.ts",
    "index abc..def 100644",
    "--- a/file.ts",
    "+++ b/file.ts",
  ].join("\n");
  const hunk = [
    "@@ -1,21 +1,21 @@",
    "-old1",
    "+new1",
    " ctx1-a",
    " ctx1-b",
    " ctx1-c",
    " fold1-hidden",
    " ctx1-d",
    " ctx1-e",
    " ctx1-f",
    "-old2",
    "+new2",
    " ctx2-a",
    " ctx2-b",
    " ctx2-c",
    " fold2-hidden",
    " ctx2-d",
    " ctx2-e",
    " ctx2-f",
    "-old3",
    "+new3",
    " tail-a",
    " tail-b",
    " tail-c",
  ].join("\n");
  return `${header}\n${hunk}`;
}

describe("fold state transitions", () => {
  it("returns a no-op message when a file has no folds", () => {
    const fullDiff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 line1
-old
+new
 line3
`;
    const visibleDiff = collapseDiff(fullDiff, new Map(), 80);

    const result = getFoldTransition({
      fullDiff,
      activeDiff: visibleDiff.diff,
      visibleDiff,
      cursorLine: 1,
      splitMode: false,
      activeSide: "new",
      expandedFolds: new Map(),
      markerWidth: 80,
      incrementalFoldLines: 20,
      fullFoldRequested: true,
    });

    expect(result).toEqual({
      changed: false,
      expandedFolds: new Map(),
      cursorLine: 1,
      flash: "No folds in file",
    });
  });

  it("expands every fold when a full fold request is made on a collapsed file", () => {
    const fullDiff = makeMultiFoldDiff();
    const visibleDiff = collapseDiff(fullDiff, new Map(), 80);

    const result = getFoldTransition({
      fullDiff,
      activeDiff: visibleDiff.diff,
      visibleDiff,
      cursorLine: 1,
      splitMode: false,
      activeSide: "new",
      markerLinesForView: visibleDiff.markerLines,
      expandedFolds: new Map(),
      markerWidth: 80,
      incrementalFoldLines: 20,
      fullFoldRequested: true,
    });

    expect(result?.changed).toBe(true);
    expect(result?.flash).toContain("Expanded all folds");
    expect(
      collapseDiff(fullDiff, result?.expandedFolds ?? new Map(), 80).markerLines
        .size,
    ).toBe(0);
  });

  it("collapses every fold when a full fold request is made on a fully expanded file", () => {
    const fullDiff = makeMultiFoldDiff();
    const initiallyCollapsed = collapseDiff(fullDiff, new Map(), 80);
    const expandedFolds = new Map(
      initiallyCollapsed.folds.map((fold) => [fold.id, fold.hiddenCount]),
    );
    const expandedDiff = collapseDiff(fullDiff, expandedFolds, 80);

    const result = getFoldTransition({
      fullDiff,
      activeDiff: expandedDiff.diff,
      visibleDiff: expandedDiff,
      cursorLine: 8,
      splitMode: false,
      activeSide: "new",
      markerLinesForView: expandedDiff.markerLines,
      expandedFolds,
      markerWidth: 80,
      incrementalFoldLines: 20,
      fullFoldRequested: true,
    });

    expect(result?.changed).toBe(true);
    expect(result?.flash).toContain("Collapsed all folds");
    expect(
      collapseDiff(fullDiff, result?.expandedFolds ?? new Map(), 80).markerLines
        .size,
    ).toBeGreaterThan(0);
  });

  it("increments a fold from its marker row", () => {
    const fullDiff = makeFoldHeavyDiff();
    const visibleDiff = collapseDiff(fullDiff, new Map(), 80);
    const markerLine = [...visibleDiff.markerLines.keys()][0];

    const result = getFoldTransition({
      fullDiff,
      activeDiff: visibleDiff.diff,
      visibleDiff,
      cursorLine: markerLine ?? 1,
      splitMode: false,
      activeSide: "new",
      markerLinesForView: visibleDiff.markerLines,
      expandedFolds: new Map(),
      markerWidth: 80,
      incrementalFoldLines: 5,
      fullFoldRequested: false,
    });

    const revealed = result?.expandedFolds.get(visibleDiff.folds[0]!.id);
    expect(result?.changed).toBe(true);
    expect(revealed).toBe(5);
    expect(result?.flash).toContain("+5 lines");
  });
});
