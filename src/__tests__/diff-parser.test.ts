import { describe, expect, it } from "bun:test";
import {
  displayLineToSourceLineSplit,
  displayRangeToSourceRange,
  displayRangeToSourceRangeSplit,
  getDiffLineType,
  getDisplayLineCount,
  getLineFromDiff,
  isPureDeletion,
  parseNumstat,
  sourceLineToDisplayLineSplit,
} from "../data/diff-parser.ts";

const SAMPLE_DIFF = `diff --git a/src/main.py b/src/main.py
index abc1234..def5678 100644
--- a/src/main.py
+++ b/src/main.py
@@ -10,7 +10,8 @@ def process():
     data = load()
-    result = transform(data)
+    if data is None:
+        return None
+    result = validate_and_transform(data)
     return result
`;

const MULTI_HUNK_DIFF = `diff --git a/app.ts b/app.ts
index 1111..2222 100644
--- a/app.ts
+++ b/app.ts
@@ -1,4 +1,4 @@
-import { old } from "old";
+import { new as n } from "new";

 const x = 1;
 const y = 2;
@@ -20,3 +20,4 @@ function run() {
   console.log("running");
+  console.log("debug");
   return true;
`;

describe("getLineFromDiff", () => {
  describe("new side", () => {
    it("returns added line", () => {
      const line = getLineFromDiff(SAMPLE_DIFF, 11, "new");
      expect(line).toBe("+    if data is None:");
    });

    it("returns second added line", () => {
      const line = getLineFromDiff(SAMPLE_DIFF, 12, "new");
      expect(line).toBe("+        return None");
    });

    it("returns context line on new side", () => {
      const line = getLineFromDiff(SAMPLE_DIFF, 10, "new");
      expect(line).toContain("data = load()");
    });

    it("returns null for non-existent line", () => {
      const line = getLineFromDiff(SAMPLE_DIFF, 999, "new");
      expect(line).toBeNull();
    });
  });

  describe("old side", () => {
    it("returns deleted line", () => {
      const line = getLineFromDiff(SAMPLE_DIFF, 11, "old");
      expect(line).toBe("-    result = transform(data)");
    });

    it("returns context line on old side", () => {
      const line = getLineFromDiff(SAMPLE_DIFF, 10, "old");
      expect(line).toContain("data = load()");
    });
  });

  describe("multi-hunk diff", () => {
    it("finds line in first hunk", () => {
      const line = getLineFromDiff(MULTI_HUNK_DIFF, 1, "new");
      expect(line).toBe('+import { new as n } from "new";');
    });

    it("finds line in second hunk", () => {
      const line = getLineFromDiff(MULTI_HUNK_DIFF, 21, "new");
      expect(line).toBe('+  console.log("debug");');
    });
  });

  describe("empty diff", () => {
    it("returns null for empty string", () => {
      expect(getLineFromDiff("", 1, "new")).toBeNull();
    });

    it("returns null for diff without hunks", () => {
      const headerOnly = "diff --git a/f b/f\nindex abc..def 100644\n";
      expect(getLineFromDiff(headerOnly, 1, "new")).toBeNull();
    });
  });
});

describe("parseNumstat", () => {
  it("parses standard numstat output", () => {
    const input = "42\t15\tsrc/main.py\n30\t0\tsrc/utils.py\n";
    const map = parseNumstat(input);

    expect(map.get("src/main.py")).toEqual({ additions: 42, deletions: 15 });
    expect(map.get("src/utils.py")).toEqual({ additions: 30, deletions: 0 });
  });

  it("handles binary files (- marks)", () => {
    const input = "-\t-\timage.png\n";
    const map = parseNumstat(input);

    expect(map.get("image.png")).toEqual({ additions: 0, deletions: 0 });
  });

  it("handles renames with braces", () => {
    const input = "5\t3\t{old_dir => new_dir}/file.ts\n";
    const map = parseNumstat(input);

    expect(map.get("new_dir/file.ts")).toEqual({ additions: 5, deletions: 3 });
  });

  it("handles empty input", () => {
    const map = parseNumstat("");
    expect(map.size).toBe(0);
  });

  it("handles multiple files", () => {
    const input = "10\t5\ta.ts\n20\t3\tb.ts\n0\t80\tc.ts\n";
    const map = parseNumstat(input);

    expect(map.size).toBe(3);
    expect(map.get("a.ts")).toEqual({ additions: 10, deletions: 5 });
    expect(map.get("c.ts")).toEqual({ additions: 0, deletions: 80 });
  });
});

describe("getDisplayLineCount", () => {
  it("counts content lines only (no hunk headers) in unified mode", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,4 @@
 line1
+added
 line2
 line3
`;
    // 4 content lines only (hunk header NOT counted)
    expect(getDisplayLineCount(diff)).toBe(4);
  });

  it("counts across multiple hunks in unified mode", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,2 +1,2 @@
 a
-b
+c
@@ -10,2 +10,2 @@
 x
-y
+z
`;
    // 3 + 3 content lines = 6 (hunk headers NOT counted)
    expect(getDisplayLineCount(diff)).toBe(6);
  });

  it("returns 1 for empty diff", () => {
    expect(getDisplayLineCount("")).toBe(1);
  });

  it("counts split mode lines with padding", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,4 @@
 context
-removed
+added1
+added2
 context2
`;
    // unified: 5 lines (context, -removed, +added1, +added2, context2)
    expect(getDisplayLineCount(diff)).toBe(5);
    // split: context(1) + max(1 removal, 2 additions)=2 + context2(1) = 4
    expect(getDisplayLineCount(diff, true)).toBe(4);
  });

  it("handles equal removals and additions in split mode", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,2 +1,2 @@
-old
+new
`;
    // unified: 2 lines
    expect(getDisplayLineCount(diff)).toBe(2);
    // split: max(1,1) = 1
    expect(getDisplayLineCount(diff, true)).toBe(1);
  });
});

describe("getDiffLineType", () => {
  const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,4 @@
 context
+added
-deleted
 context2
`;

  it("identifies context line", () => {
    // Line 1 = first content line (hunk header skipped)
    expect(getDiffLineType(diff, 1)).toBe(" ");
  });

  it("identifies added line", () => {
    expect(getDiffLineType(diff, 2)).toBe("+");
  });

  it("identifies deleted line", () => {
    expect(getDiffLineType(diff, 3)).toBe("-");
  });

  it("identifies second context line", () => {
    expect(getDiffLineType(diff, 4)).toBe(" ");
  });

  it("returns null for out of range", () => {
    expect(getDiffLineType(diff, 100)).toBeNull();
  });
});

describe("GENERATED_PATTERNS", () => {
  // Import the patterns directly to test detection
  it("is covered via constants import", async () => {
    const { GENERATED_PATTERNS } = await import("../constants.ts");

    const generated = [
      "bun.lockb",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bundle.min.js",
      "style.min.css",
      "app.js.map",
      "dist/index.js",
      "build/output.css",
      "schema.generated.ts",
    ];

    const notGenerated = [
      "src/main.ts",
      "package.json",
      "README.md",
      "src/utils/lock.ts",
      "dist.config.ts",
    ];

    for (const path of generated) {
      expect(
        GENERATED_PATTERNS.some((p) => p.test(path)),
        `"${path}" should be detected as generated`,
      ).toBe(true);
    }

    for (const path of notGenerated) {
      expect(
        GENERATED_PATTERNS.some((p) => p.test(path)),
        `"${path}" should NOT be detected as generated`,
      ).toBe(false);
    }
  });
});

describe("displayRangeToSourceRange", () => {
  // Diff layout:
  // display 1: " context"       old=10, new=10
  // display 2: "-old"           old=11
  // display 3: "+if data"       new=11
  // display 4: "+  return None" new=12
  // display 5: "+result = ..."  new=13
  // display 6: " return result" old=12, new=14
  const diff = SAMPLE_DIFF;

  it("returns consistent new-side range for mixed selection", () => {
    // Select display 1-3: context(old=10,new=10), deletion(old=11), addition(new=11)
    // new side lines: 10, 11 → range 10-11
    const range = displayRangeToSourceRange(diff, 1, 3);
    expect(range.side).toBe("new");
    expect(range.start).toBe(10);
    expect(range.end).toBe(11);
  });

  it("returns new-side range when all lines have new", () => {
    // Select display 3-5: all + lines, new=11,12,13
    const range = displayRangeToSourceRange(diff, 3, 5);
    expect(range.side).toBe("new");
    expect(range.start).toBe(11);
    expect(range.end).toBe(13);
  });

  it("returns old-side range when only deletions selected", () => {
    // Construct a diff with only deletions
    const delDiff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,4 +1,2 @@
 ctx
-del1
-del2
 ctx2
`;
    // display 2,3 = "-del1"(old=2), "-del2"(old=3) — no new lines
    const range = displayRangeToSourceRange(delDiff, 2, 3);
    expect(range.side).toBe("old");
    expect(range.start).toBe(2);
    expect(range.end).toBe(3);
  });

  it("does not mix old and new side line numbers", () => {
    // Select display 1-6 (entire hunk): context + del + adds + context
    // new lines: 10, 11, 12, 13, 14 → 10-14
    const range = displayRangeToSourceRange(diff, 1, 6);
    expect(range.side).toBe("new");
    expect(range.start).toBe(10);
    expect(range.end).toBe(14);
  });

  it("handles single display line", () => {
    const range = displayRangeToSourceRange(diff, 2, 2);
    // display 2 = "-old" → old=11, no new → side=old
    expect(range.side).toBe("old");
    expect(range.start).toBe(11);
    expect(range.end).toBe(11);
  });
});

describe("isPureDeletion", () => {
  it("returns true for pure deletion (no additions follow)", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,2 @@
 context
-deleted line
 context2
`;
    // Display line 2 = "-deleted line"
    expect(isPureDeletion(diff, 2)).toBe(true);
  });

  it("returns false for modification (deletion followed by addition)", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,3 @@
 context
-old line
+new line
 context2
`;
    // Display line 2 = "-old line" (part of a modification group)
    expect(isPureDeletion(diff, 2)).toBe(false);
  });

  it("returns false for non-deletion line", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,2 +1,3 @@
 context
+added
 context2
`;
    // Display line 1 = " context" (not a deletion)
    expect(isPureDeletion(diff, 1)).toBe(false);
    // Display line 2 = "+added" (not a deletion)
    expect(isPureDeletion(diff, 2)).toBe(false);
  });

  it("handles multiple deletions followed by additions", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,4 +1,4 @@
 context
-old1
-old2
+new1
+new2
 context2
`;
    // Display lines 2,3 = "-old1", "-old2" → both are modifications
    expect(isPureDeletion(diff, 2)).toBe(false);
    expect(isPureDeletion(diff, 3)).toBe(false);
  });

  it("handles multiple pure deletions", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,4 +1,2 @@
 context
-removed1
-removed2
 context2
`;
    // Display lines 2,3 = "-removed1", "-removed2" → pure deletions
    expect(isPureDeletion(diff, 2)).toBe(true);
    expect(isPureDeletion(diff, 3)).toBe(true);
  });

  it("returns false for out-of-range line", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,2 +1,2 @@
-a
+b
`;
    expect(isPureDeletion(diff, 100)).toBe(false);
  });

  it("handles mixed groups in multi-hunk diff", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,2 @@
 context
-pure deletion
 more context
@@ -10,3 +9,3 @@
 context
-old
+new
 context2
`;
    // First hunk: line 2 = "-pure deletion" → pure deletion
    expect(isPureDeletion(diff, 2)).toBe(true);
    // Second hunk: line 4 = "-old" → modification
    expect(isPureDeletion(diff, 4)).toBe(false);
  });
});

// ── Split-mode conversion tests ──

// SAMPLE_DIFF layout:
// @@ -10,7 +10,8 @@
//  data = load()          → context: old=10, new=10
// -result = transform()   → removal: old=11
// +if data is None:       → addition: new=11
// +    return None         → addition: new=12
// +result = validate...   → addition: new=13
//  return result          → context: old=12, new=14
//
// Split rows:
// Row 1: context           old=10, new=10
// Row 2: old[0]=11, new[0]=11   (1 removal paired with 1st addition)
// Row 3: old=null,  new[1]=12   (padded old, 2nd addition)
// Row 4: old=null,  new[2]=13   (padded old, 3rd addition)
// Row 5: context           old=12, new=14

describe("displayLineToSourceLineSplit", () => {
  it("returns both lines for context row", () => {
    const src = displayLineToSourceLineSplit(SAMPLE_DIFF, 1);
    expect(src).toEqual({ oldLine: 10, newLine: 10 });
  });

  it("returns paired old+new for first row of change group", () => {
    // Row 2: 1 removal paired with 1st addition
    const src = displayLineToSourceLineSplit(SAMPLE_DIFF, 2);
    expect(src).toEqual({ oldLine: 11, newLine: 11 });
  });

  it("returns null old for padded rows", () => {
    // Row 3: old side exhausted, new side continues
    const src = displayLineToSourceLineSplit(SAMPLE_DIFF, 3);
    expect(src).toEqual({ oldLine: null, newLine: 12 });
  });

  it("returns null old for second padded row", () => {
    const src = displayLineToSourceLineSplit(SAMPLE_DIFF, 4);
    expect(src).toEqual({ oldLine: null, newLine: 13 });
  });

  it("returns both lines for trailing context", () => {
    const src = displayLineToSourceLineSplit(SAMPLE_DIFF, 5);
    expect(src).toEqual({ oldLine: 12, newLine: 14 });
  });

  it("returns nulls for out of range", () => {
    const src = displayLineToSourceLineSplit(SAMPLE_DIFF, 99);
    expect(src).toEqual({ oldLine: null, newLine: null });
  });

  it("handles pure deletion (more removals than additions)", () => {
    const diff = `diff --git a/f.ts b/f.ts
--- a/f.ts
+++ b/f.ts
@@ -1,4 +1,2 @@
 ctx
-del1
-del2
 ctx2
`;
    // Split rows:
    // Row 1: context old=1,new=1
    // Row 2: old=2,new=null (2 removals, 0 additions → 2 rows)
    // Row 3: old=3,new=null
    // Row 4: context old=4,new=2
    expect(displayLineToSourceLineSplit(diff, 2)).toEqual({
      oldLine: 2,
      newLine: null,
    });
    expect(displayLineToSourceLineSplit(diff, 3)).toEqual({
      oldLine: 3,
      newLine: null,
    });
  });
});

describe("sourceLineToDisplayLineSplit", () => {
  it("maps new side source to correct split row", () => {
    // new=11 is at split row 2
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 11, "new")).toBe(2);
    // new=12 is at split row 3
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 12, "new")).toBe(3);
    // new=13 is at split row 4
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 13, "new")).toBe(4);
  });

  it("maps old side source to correct split row", () => {
    // old=10 is at split row 1 (context)
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 10, "old")).toBe(1);
    // old=11 is at split row 2
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 11, "old")).toBe(2);
    // old=12 is at split row 5 (context)
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 12, "old")).toBe(5);
  });

  it("returns null for non-existent source line", () => {
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 999, "new")).toBeNull();
  });

  it("maps context line for both sides", () => {
    // Context: old=10 and new=10 both at row 1
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 10, "old")).toBe(1);
    expect(sourceLineToDisplayLineSplit(SAMPLE_DIFF, 10, "new")).toBe(1);
  });
});

describe("displayRangeToSourceRangeSplit", () => {
  it("returns new-side range", () => {
    // Rows 2-4: new=11,12,13
    const range = displayRangeToSourceRangeSplit(SAMPLE_DIFF, 2, 4, "new");
    expect(range).toEqual({ start: 11, end: 13, side: "new" });
  });

  it("returns old-side range for rows that have old lines", () => {
    // Rows 1-2: old=10,11
    const range = displayRangeToSourceRangeSplit(SAMPLE_DIFF, 1, 2, "old");
    expect(range).toEqual({ start: 10, end: 11, side: "old" });
  });

  it("returns null when side has no lines in range", () => {
    // Rows 3-4: old side is null (padded)
    const range = displayRangeToSourceRangeSplit(SAMPLE_DIFF, 3, 4, "old");
    expect(range).toBeNull();
  });

  it("skips padded rows and collects only available lines", () => {
    // Rows 1-5 new side: 10, 11, 12, 13, 14
    const range = displayRangeToSourceRangeSplit(SAMPLE_DIFF, 1, 5, "new");
    expect(range).toEqual({ start: 10, end: 14, side: "new" });
  });

  it("handles single row", () => {
    const range = displayRangeToSourceRangeSplit(SAMPLE_DIFF, 1, 1, "new");
    expect(range).toEqual({ start: 10, end: 10, side: "new" });
  });
});
