import { describe, expect, it } from "bun:test";
import type { TreeSitterClient } from "@opentui/core";
import { collapseDiff, FOLD_MARKER_PATTERN } from "../data/diff-collapse.ts";
import {
  buildSplitHighlightInputs,
  buildSplitProjectedHighlights,
  buildUnifiedHighlightInputs,
  buildUnifiedProjectedHighlights,
} from "../utils/diff-syntax.ts";

function createFakeTreeSitterClient(
  needle: string,
): Pick<TreeSitterClient, "highlightOnce"> {
  return {
    async highlightOnce(content: string) {
      const start = content.indexOf(needle);
      if (start === -1) return { highlights: [] };
      return {
        highlights: [[start, start + needle.length, "string"]] as const,
      };
    },
  };
}

describe("diff syntax projection", () => {
  it("blanks unified opposite-side lines while preserving widths", () => {
    const rawDiff = `diff --git a/a.json b/a.json
--- a/a.json
+++ b/a.json
@@ -1,4 +1,4 @@
-  "oldKey": 1,
+  "newKey": 2,
   "same": true
`;

    const { oldContent, newContent } = buildUnifiedHighlightInputs(rawDiff);

    expect(oldContent.split("\n")[0]).toBe('  "oldKey": 1,');
    expect(oldContent.split("\n")[1]).toBe(" ".repeat('  "newKey": 2,'.length));
    expect(newContent.split("\n")[0]).toBe(" ".repeat('  "oldKey": 1,'.length));
    expect(newContent.split("\n")[1]).toBe('  "newKey": 2,');
    expect(oldContent.split("\n")[2]).toBe('  "same": true');
    expect(newContent.split("\n")[2]).toBe('  "same": true');
  });

  it("blanks fold marker lines in unified and split inputs", () => {
    const marker = `12${FOLD_MARKER_PATTERN}`;
    const rawDiff = `@@ -1,3 +1,3 @@
 foo: 1
 ${marker}
 bar: 2`;

    const { oldContent, newContent } = buildUnifiedHighlightInputs(rawDiff);
    const { leftContent, rightContent } = buildSplitHighlightInputs(rawDiff);

    expect(oldContent.split("\n")).toEqual([
      "foo: 1",
      " ".repeat(marker.length),
      "bar: 2",
    ]);
    expect(newContent.split("\n")).toEqual([
      "foo: 1",
      " ".repeat(marker.length),
      "bar: 2",
    ]);
    expect(leftContent.split("\n")).toEqual([
      "foo: 1",
      " ".repeat(marker.length),
      "bar: 2",
    ]);
    expect(rightContent.split("\n")).toEqual([
      "foo: 1",
      " ".repeat(marker.length),
      "bar: 2",
    ]);
  });

  it("projects unified highlights from the full diff across folded regions", async () => {
    const fullDiff = `diff --git a/config.yaml b/config.yaml
--- a/config.yaml
+++ b/config.yaml
@@ -1,9 +1,9 @@
 root:
   head: true
   alpha: 1
   beta: 2
   gamma: 3
   delta: 4
   epsilon: 5
   zeta: 6
   tail: ok
`;
    const collapsed = collapseDiff(fullDiff, new Map(), 80);
    const treeSitterClient = createFakeTreeSitterClient("tail: ok");
    const { oldContent } = buildUnifiedHighlightInputs(collapsed.diff);
    const tailStart = oldContent.indexOf("tail: ok");

    expect(collapsed.diff).toContain(FOLD_MARKER_PATTERN);
    expect(tailStart).toBeGreaterThan(-1);

    const highlights = await buildUnifiedProjectedHighlights(
      fullDiff,
      collapsed.diff,
      "yaml",
      treeSitterClient,
    );

    expect(highlights).toContainEqual([tailStart, tailStart + 8, "string"]);
  });

  it("projects split highlights from the full diff across folded regions", async () => {
    const fullDiff = `diff --git a/config.yaml b/config.yaml
--- a/config.yaml
+++ b/config.yaml
@@ -1,9 +1,9 @@
 root:
   head: true
   alpha: 1
   beta: 2
   gamma: 3
   delta: 4
   epsilon: 5
   zeta: 6
   tail: ok
`;
    const collapsed = collapseDiff(fullDiff, new Map(), 80);
    const treeSitterClient = createFakeTreeSitterClient("tail: ok");
    const { leftContent } = buildSplitHighlightInputs(collapsed.diff);
    const tailStart = leftContent.indexOf("tail: ok");

    expect(collapsed.diff).toContain(FOLD_MARKER_PATTERN);
    expect(tailStart).toBeGreaterThan(-1);

    const highlights = await buildSplitProjectedHighlights(
      fullDiff,
      collapsed.diff,
      "yaml",
      "left",
      treeSitterClient,
    );

    expect(highlights).toContainEqual([tailStart, tailStart + 8, "string"]);
  });
});
