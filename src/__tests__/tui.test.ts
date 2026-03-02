import { describe, expect, it, mock } from "bun:test";
import { setMaxListeners } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiffRenderable } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { act, createElement, useMemo, useState } from "react";
import { App } from "../app.tsx";
import { CommentList } from "../components/comment-list.tsx";
import { DiffView } from "../components/diff-view.tsx";
import { FileTree } from "../components/file-tree.tsx";
import { Header } from "../components/header.tsx";
import { HelpBar } from "../components/help-bar.tsx";
import { HomeScreen } from "../components/home-screen.tsx";
import { PromptPreview } from "../components/prompt-preview.tsx";
import { COLORS } from "../constants.ts";
import { commentStore } from "../data/comment-store.ts";
import {
  buildSplitDisplayLineTypeMap,
  displayLineToSourceLineSplit,
  getDiffLineType,
  getDisplayLineCount,
} from "../data/diff-parser.ts";
import {
  DEFAULT_ORBIT_CONFIG,
  DEFAULT_ORBIT_KEYBINDINGS,
} from "../data/persistence.ts";
import type { DiffFile, ReviewComment } from "../types.ts";
import { buildFileTree, flattenTree } from "../utils/file-tree.ts";

const RENDER_OPTS = { width: 80, height: 24 };
process.env.ORBIT_DISABLE_TREESITTER = "1";
setMaxListeners(50);
type DiffLineColor = Parameters<DiffRenderable["setLineColor"]>[1];

function makeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: "src/main.py",
    status: "modified",
    additions: 10,
    deletions: 5,
    rawDiff: `diff --git a/src/main.py b/src/main.py
--- a/src/main.py
+++ b/src/main.py
@@ -1,5 +1,10 @@
 import sys
+import os

 def main():
-    print("hello")
+    print("world")
+    return 0
`,
    isGenerated: false,
    ...overrides,
  };
}

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "c1",
    filePath: "src/main.py",
    body: "Fix this",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    position: { side: "new", line: 5 },
    resolved: false,
    ...overrides,
  };
}

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

function findDiffRenderable(root: { getChildren: () => unknown[] }):
  | (DiffRenderable & {
      buildView: (...args: unknown[]) => unknown;
      clearLineColor: (line: number) => void;
    })
  | null {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (cur instanceof DiffRenderable) {
      const withBuild = cur as DiffRenderable & {
        buildView?: (...args: unknown[]) => unknown;
        clearLineColor?: (line: number) => void;
      };
      if (typeof withBuild.buildView === "function") {
        return withBuild as DiffRenderable & {
          buildView: (...args: unknown[]) => unknown;
          clearLineColor: (line: number) => void;
        };
      }
      continue;
    }
    if (
      "getChildren" in cur &&
      typeof (cur as { getChildren?: unknown }).getChildren === "function"
    ) {
      const children = (cur as { getChildren: () => unknown[] }).getChildren();
      for (const child of children) stack.push(child);
    }
  }
  return null;
}

// ── Header ──
describe("Header component", () => {
  it("renders title and comment count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(Header, {
        title: "HEAD~1..HEAD (2 files)",
        commentCount: 3,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("orbit:");
    expect(frame).toContain("HEAD~1..HEAD");
    expect(frame).toContain("3 comments");
  });
});

// ── HelpBar ──
describe("HelpBar component", () => {
  it("shows file-list keybindings", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "file-list" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Enter");
    expect(frame).toContain("quit");
  });

  it("shows diff-view keybindings", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "diff-view" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("comment");
    expect(frame).toContain("split");
  });

  it("shows select hint in diff-view", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "diff-view" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("select");
  });

  it("shows flash message when present", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "file-list", flash: "Copied!" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Copied!");
  });

  it("shows comment-input keybindings", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "comment-input" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Ctrl+Enter");
    expect(frame).toContain("Esc");
  });

  it("reflects custom keybindings", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, {
        mode: "file-list",
        keybindings: {
          ...DEFAULT_ORBIT_KEYBINDINGS,
          fileTree: {
            ...DEFAULT_ORBIT_KEYBINDINGS.fileTree,
            promptPreview: "o",
          },
        },
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("o:");
    expect(frame).toContain("prompt-preview");
  });
});

// ── FileTree ──
describe("FileTree component", () => {
  const files: DiffFile[] = [
    makeFile({
      path: "src/main.py",
      status: "modified",
      additions: 10,
      deletions: 5,
    }),
    makeFile({
      path: "src/utils.py",
      status: "added",
      additions: 30,
      deletions: 0,
    }),
    makeFile({
      path: "tests/old.py",
      status: "deleted",
      additions: 0,
      deletions: 80,
    }),
  ];
  const rows = flattenTree(buildFileTree(files), files, new Set<string>());

  it("renders tree rows with directories and files", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(FileTree, {
        rows,
        selectedIndex: 1,
        comments: [],
        viewedFiles: new Set<string>(),
        collapsedDirs: new Set<string>(),
        width: 40,
        height: 10,
        onSelectRow: () => {},
        onOpenFile: () => {},
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("src/");
    expect(frame).toContain("main.py");
    expect(frame).toContain("utils.py");
  });

  it("calls onSelectRow when clicking a row", async () => {
    const onSelect = mock(() => {});
    const { mockMouse, renderOnce } = await testRender(
      createElement(FileTree, {
        rows,
        selectedIndex: 0,
        comments: [],
        viewedFiles: new Set<string>(),
        collapsedDirs: new Set<string>(),
        width: 40,
        height: 10,
        onSelectRow: onSelect,
        onOpenFile: () => {},
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    await mockMouse.click(10, 1);
    await renderOnce();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("calls onOpenFile on double-click", async () => {
    const onOpen = mock(() => {});
    const { mockMouse, renderOnce } = await testRender(
      createElement(FileTree, {
        rows,
        selectedIndex: 1,
        comments: [],
        viewedFiles: new Set<string>(),
        collapsedDirs: new Set<string>(),
        width: 40,
        height: 10,
        onSelectRow: () => {},
        onOpenFile: onOpen,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    await mockMouse.click(10, 1);
    await renderOnce();
    await mockMouse.click(10, 1);
    await renderOnce();
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});

// ── HomeScreen ──
describe("HomeScreen component", () => {
  const files: DiffFile[] = [
    makeFile({ path: "src/main.py" }),
    makeFile({ path: "src/utils.py" }),
  ];
  const rows = flattenTree(buildFileTree(files), files, new Set<string>());

  it("renders file tree and preview header", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HomeScreen, {
        files,
        rows,
        selectedIndex: 1,
        comments: [],
        viewedFiles: new Set<string>(),
        collapsedDirs: new Set<string>(),
        previewSplitMode: false,
        treePercent: 0.3,
        expandedFolds: new Map<string, Map<number, number>>(),
        onTreeResize: () => {},
        onSelectRow: () => {},
        onOpenFile: () => {},
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("src/main.py");
    expect(frame).toContain("+10/-5");
  });

  it("keeps last previewed file when selection moves to a directory", async () => {
    function Harness() {
      const [selectedIndex, setSelectedIndex] = useState(1);
      const stableRows = useMemo(
        () => flattenTree(buildFileTree(files), files, new Set<string>()),
        [],
      );
      return createElement(HomeScreen, {
        files,
        rows: stableRows,
        selectedIndex,
        comments: [],
        viewedFiles: new Set<string>(),
        collapsedDirs: new Set<string>(),
        previewSplitMode: false,
        treePercent: 0.3,
        expandedFolds: new Map<string, Map<number, number>>(),
        onTreeResize: () => {},
        onSelectRow: setSelectedIndex,
        onOpenFile: () => {},
      });
    }

    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      createElement(Harness),
      RENDER_OPTS,
    );
    await renderOnce();
    await act(async () => {
      await mockMouse.click(5, 0); // select top-level directory row
      await renderOnce();
    });
    const frame = captureCharFrame();
    expect(frame).toContain("src/main.py");
    expect(frame).toContain("+10/-5");
  });
});

// ── App integration ──
describe("App integration", () => {
  it("keeps keyboard scrolling smooth after unfold (no extra buildView per arrow)", async () => {
    commentStore.reset();
    let mountedRenderer: { destroy: () => void } | null = null;
    let patchedDiff: { buildView: (...args: unknown[]) => unknown } | null =
      null;
    let originalBuildView: ((...args: unknown[]) => unknown) | null = null;
    let buildViewCalls = 0;

    try {
      const files: DiffFile[] = [
        makeFile({
          path: "file.ts",
          rawDiff: makeFoldHeavyDiff(),
          additions: 2,
          deletions: 2,
        }),
      ];

      const { captureCharFrame, mockInput, renderOnce, renderer } =
        await testRender(
          createElement(App, {
            files,
            options: {
              base: "HEAD~1",
              target: "HEAD",
              splitMode: false,
              root: false,
            },
            onQuit: () => {},
          }),
          RENDER_OPTS,
        );
      mountedRenderer = renderer;

      await renderOnce();
      await act(async () => {
        mockInput.pressEnter();
        await renderOnce();
      });
      expect(captureCharFrame()).toContain("lines hidden");
      const diffNode = findDiffRenderable(renderer.root);
      expect(diffNode).not.toBeNull();
      if (!diffNode) return;
      patchedDiff = diffNode;
      originalBuildView = diffNode.buildView;
      patchedDiff.buildView = (...args: unknown[]) => {
        buildViewCalls++;
        return originalBuildView?.apply(patchedDiff, args);
      };

      await act(async () => {
        mockInput.pressKey("z");
        await renderOnce();
      });
      const callsAfterUnfold = buildViewCalls;
      expect(callsAfterUnfold).toBeGreaterThan(0);

      await act(async () => {
        for (let i = 0; i < 8; i++) {
          mockInput.pressArrow("down");
          await renderOnce();
        }
      });
      expect(buildViewCalls).toBe(callsAfterUnfold);
    } finally {
      if (mountedRenderer) {
        await act(async () => {
          mountedRenderer?.destroy();
        });
      }
      if (patchedDiff && originalBuildView) {
        patchedDiff.buildView = originalBuildView;
      }
    }
  });

  it("uses configured keybinding in file-list mode", async () => {
    commentStore.reset();
    const { captureCharFrame, mockInput, renderOnce, renderer } =
      await testRender(
        createElement(App, {
          files: [makeFile()],
          options: {
            base: "HEAD~1",
            target: "HEAD",
            splitMode: false,
            root: false,
          },
          config: {
            ...DEFAULT_ORBIT_CONFIG,
            keybindings: {
              ...DEFAULT_ORBIT_KEYBINDINGS,
              fileTree: {
                ...DEFAULT_ORBIT_KEYBINDINGS.fileTree,
                promptPreview: "o",
              },
            },
          },
          onQuit: () => {},
        }),
        RENDER_OPTS,
      );

    try {
      await renderOnce();
      await act(async () => {
        mockInput.pressKey("o");
        await renderOnce();
      });
      const frame = captureCharFrame();
      expect(frame).toContain("Prompt Preview");
    } finally {
      await act(async () => {
        renderer.destroy();
      });
    }
  });

  it("does not overwrite config width when session prefs provide tree width", async () => {
    commentStore.reset();
    const tmpRoot = mkdtempSync(join(tmpdir(), "orbit-config-preserve-"));
    const configPath = join(tmpRoot, "config.toml");
    const originalConfig = [
      "file_tree_initial_width = 0.2",
      'initial_view = "unified"',
      "",
    ].join("\n");
    writeFileSync(configPath, originalConfig);

    const { renderOnce, renderer } = await testRender(
      createElement(App, {
        files: [makeFile()],
        options: {
          base: "HEAD~1",
          target: "HEAD",
          splitMode: false,
          root: false,
        },
        initialPrefs: { treePercent: 0.15 },
        config: DEFAULT_ORBIT_CONFIG,
        configPath,
        onQuit: () => {},
      }),
      RENDER_OPTS,
    );

    try {
      await renderOnce();
      expect(readFileSync(configPath, "utf-8")).toBe(originalConfig);
    } finally {
      await act(async () => {
        renderer.destroy();
      });
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// ── DiffView ──
describe("DiffView component", () => {
  const file = makeFile();

  it("renders diff content", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 1,
        comments: [],
        splitMode: false,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    // Should show diff content
    expect(frame).toContain("main");
  });

  it("shows comment panel when cursor is on commented line", async () => {
    // Source new line 5 = display line 6 in the test diff
    const comments = [makeComment({ position: { side: "new", line: 5 } })];
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 6,
        comments,
        splitMode: false,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Fix this");
    expect(frame).toContain("comments");
  });

  it("does not show comment panel on non-commented line", async () => {
    const comments = [makeComment({ position: { side: "new", line: 5 } })];
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 1,
        comments,
        splitMode: false,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("Fix this");
  });

  it("calls onCursorChange when scrollbox is clicked", async () => {
    const onCursorChange = mock(() => {});
    const { mockMouse, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 1,
        comments: [],
        splitMode: false,
        onCursorChange,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    await mockMouse.click(10, 5);
    await renderOnce();
    expect(onCursorChange).toHaveBeenCalled();
    const calledLine = onCursorChange.mock.calls[0]![0];
    expect(calledLine).toBeGreaterThan(0);
  });

  it("reports clicked side in split mode", async () => {
    const onCursorChange = mock(() => {});
    const max = getDisplayLineCount(file.rawDiff, true);
    let rowWithBothSides: number | null = null;
    for (let d = 1; d <= max; d++) {
      const src = displayLineToSourceLineSplit(file.rawDiff, d);
      if (src.oldLine !== null && src.newLine !== null) {
        rowWithBothSides = d;
        break;
      }
    }
    expect(rowWithBothSides).not.toBeNull();
    if (!rowWithBothSides) return;

    const { mockMouse, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 1,
        comments: [],
        splitMode: true,
        onCursorChange,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    await mockMouse.click(5, rowWithBothSides - 1);
    await renderOnce();
    await mockMouse.click(70, rowWithBothSides - 1);
    await renderOnce();

    const sides = onCursorChange.mock.calls
      .map((call) => call[1])
      .filter((s): s is "old" | "new" => s === "old" || s === "new");
    expect(sides).toContain("old");
    expect(sides).toContain("new");
  });

  it("ignores clicks on split-side padded rows", async () => {
    const splitPadFile = makeFile({
      rawDiff: `diff --git a/pad.ts b/pad.ts
--- a/pad.ts
+++ b/pad.ts
@@ -1,4 +1,3 @@
-a
-b
+B
 c
 d
`,
    });
    const onCursorChange = mock(() => {});
    const max = getDisplayLineCount(splitPadFile.rawDiff, true);
    let paddedOnNew: number | null = null;
    for (let d = 1; d <= max; d++) {
      const src = displayLineToSourceLineSplit(splitPadFile.rawDiff, d);
      if (src.oldLine !== null && src.newLine === null) {
        paddedOnNew = d;
        break;
      }
    }
    expect(paddedOnNew).not.toBeNull();
    if (!paddedOnNew) return;

    const { mockMouse, renderOnce } = await testRender(
      createElement(DiffView, {
        file: splitPadFile,
        cursorLine: 1,
        comments: [],
        splitMode: true,
        onCursorChange,
      }),
      RENDER_OPTS,
    );
    await renderOnce();

    await mockMouse.click(70, paddedOnNew - 1);
    await renderOnce();
    expect(onCursorChange).not.toHaveBeenCalled();

    await mockMouse.click(5, paddedOnNew - 1);
    await renderOnce();
    expect(onCursorChange).toHaveBeenCalledTimes(1);
    expect(onCursorChange.mock.calls[0]![0]).toBe(paddedOnNew);
    expect(onCursorChange.mock.calls[0]![1]).toBe("old");
  });

  it("keeps native +/- line colors when cursor moves away", async () => {
    let setCursorLine: ((line: number) => void) | null = null;
    let mountedRenderer: { destroy: () => void } | null = null;
    let patchedDiff:
      | (DiffRenderable & { clearLineColor: (line: number) => void })
      | null = null;
    let originalClear: ((line: number) => void) | null = null;
    let originalSet: ((line: number, color: DiffLineColor) => void) | null =
      null;
    const clearedLines: number[] = [];
    const setCalls: Array<{ line: number; color: DiffLineColor }> = [];

    const maxLine = getDisplayLineCount(file.rawDiff, false);
    let addedLine: number | null = null;
    let removedLine: number | null = null;
    for (let d = 1; d <= maxLine; d++) {
      const t = getDiffLineType(file.rawDiff, d);
      if (t === "+" && addedLine === null) addedLine = d;
      if (t === "-" && removedLine === null) removedLine = d;
    }
    expect(addedLine).not.toBeNull();
    expect(removedLine).not.toBeNull();
    if (!addedLine || !removedLine) return;

    function Harness() {
      const [cursor, setCursor] = useState(1);
      setCursorLine = setCursor;
      return createElement(DiffView, {
        file,
        cursorLine: cursor,
        comments: [],
        splitMode: false,
      });
    }

    try {
      const { renderOnce, renderer } = await testRender(
        createElement(Harness),
        RENDER_OPTS,
      );
      mountedRenderer = renderer;
      await renderOnce();

      const diffNode = findDiffRenderable(renderer.root);
      expect(diffNode).not.toBeNull();
      if (!diffNode) return;
      patchedDiff = diffNode;
      originalClear = patchedDiff.clearLineColor;
      originalSet = patchedDiff.setLineColor.bind(patchedDiff);
      patchedDiff.clearLineColor = (line: number) => {
        clearedLines.push(line);
        return originalClear?.call(patchedDiff, line);
      };
      patchedDiff.setLineColor = (line: number, color: DiffLineColor) => {
        setCalls.push({ line, color });
        originalSet?.(line, color);
      };

      await act(async () => {
        setCursorLine?.(addedLine);
        await renderOnce();
      });
      await act(async () => {
        setCursorLine?.(Math.min(addedLine + 1, maxLine));
        await renderOnce();
      });

      await act(async () => {
        setCursorLine?.(removedLine);
        await renderOnce();
      });
      await act(async () => {
        setCursorLine?.(Math.min(removedLine + 1, maxLine));
        await renderOnce();
      });

      expect(clearedLines).not.toContain(addedLine - 1);
      expect(clearedLines).not.toContain(removedLine - 1);
      const hasAddedNativeRestore = setCalls.some(
        (c) =>
          c.line === addedLine - 1 &&
          typeof c.color === "object" &&
          c.color !== null &&
          "content" in c.color,
      );
      const hasRemovedNativeRestore = setCalls.some(
        (c) =>
          c.line === removedLine - 1 &&
          typeof c.color === "object" &&
          c.color !== null &&
          "content" in c.color,
      );
      expect(hasAddedNativeRestore).toBeTrue();
      expect(hasRemovedNativeRestore).toBeTrue();
    } finally {
      if (patchedDiff && originalClear) {
        patchedDiff.clearLineColor = originalClear;
      }
      if (patchedDiff && originalSet) {
        patchedDiff.setLineColor = originalSet;
      }
      if (mountedRenderer) {
        await act(async () => {
          mountedRenderer?.destroy();
        });
      }
    }
  });

  it("restores split +/- native colors with gutter/content config", async () => {
    const splitFile = makeFile({
      rawDiff: `diff --git a/s.ts b/s.ts
--- a/s.ts
+++ b/s.ts
@@ -1,4 +1,4 @@
 a
-b_old
+b_new
 c
 d
`,
    });
    const rows = buildSplitDisplayLineTypeMap(splitFile.rawDiff);
    const changedLine = rows.findIndex((r) => r.old === "-" && r.new === "+");
    expect(changedLine).toBeGreaterThan(0);
    if (changedLine <= 0) return;

    let setCursorLine: ((line: number) => void) | null = null;
    let setSide: ((side: "old" | "new") => void) | null = null;
    let mountedRenderer: { destroy: () => void } | null = null;
    const leftSetCalls: Array<{ line: number; color: DiffLineColor }> = [];
    const rightSetCalls: Array<{ line: number; color: DiffLineColor }> = [];
    let restoreLeftSet: (() => void) | null = null;
    let restoreRightSet: (() => void) | null = null;

    function Harness() {
      const [cursor, setCursor] = useState(1);
      const [side, setActiveSide] = useState<"old" | "new">("old");
      setCursorLine = setCursor;
      setSide = setActiveSide;
      return createElement(DiffView, {
        file: splitFile,
        cursorLine: cursor,
        comments: [],
        splitMode: true,
        activeSide: side,
      });
    }

    try {
      const { renderOnce, renderer } = await testRender(
        createElement(Harness),
        RENDER_OPTS,
      );
      mountedRenderer = renderer;
      await renderOnce();

      const diffNode = findDiffRenderable(renderer.root);
      expect(diffNode).not.toBeNull();
      if (!diffNode) return;

      const sides = diffNode as DiffRenderable & {
        leftSide?: {
          setLineColor: (line: number, color: DiffLineColor) => void;
        };
        rightSide?: {
          setLineColor: (line: number, color: DiffLineColor) => void;
        };
      };
      expect(sides.leftSide).toBeDefined();
      expect(sides.rightSide).toBeDefined();
      if (!sides.leftSide || !sides.rightSide) return;

      const originalLeftSet = sides.leftSide.setLineColor.bind(sides.leftSide);
      const originalRightSet = sides.rightSide.setLineColor.bind(
        sides.rightSide,
      );
      sides.leftSide.setLineColor = (line: number, color: DiffLineColor) => {
        leftSetCalls.push({ line, color });
        originalLeftSet(line, color);
      };
      sides.rightSide.setLineColor = (line: number, color: DiffLineColor) => {
        rightSetCalls.push({ line, color });
        originalRightSet(line, color);
      };
      restoreLeftSet = () => {
        sides.leftSide!.setLineColor = originalLeftSet;
      };
      restoreRightSet = () => {
        sides.rightSide!.setLineColor = originalRightSet;
      };

      const moveLine = changedLine === 1 ? 2 : 1;
      await act(async () => {
        setSide?.("old");
        setCursorLine?.(changedLine);
        await renderOnce();
      });
      await act(async () => {
        setCursorLine?.(moveLine);
        await renderOnce();
      });
      await act(async () => {
        setSide?.("new");
        setCursorLine?.(changedLine);
        await renderOnce();
      });
      await act(async () => {
        setCursorLine?.(moveLine);
        await renderOnce();
      });

      const leftRestoredAsConfig = leftSetCalls.some(
        (c) =>
          c.line === changedLine - 1 &&
          typeof c.color === "object" &&
          c.color !== null &&
          "content" in c.color,
      );
      const rightRestoredAsConfig = rightSetCalls.some(
        (c) =>
          c.line === changedLine - 1 &&
          typeof c.color === "object" &&
          c.color !== null &&
          "content" in c.color,
      );
      expect(leftRestoredAsConfig).toBeTrue();
      expect(rightRestoredAsConfig).toBeTrue();
    } finally {
      if (restoreLeftSet) restoreLeftSet();
      if (restoreRightSet) restoreRightSet();
      if (mountedRenderer) {
        await act(async () => {
          mountedRenderer?.destroy();
        });
      }
    }
  });
});

// ── CommentList ──
describe("CommentList component", () => {
  const comments = [
    makeComment({
      id: "c1",
      filePath: "src/main.py",
      body: "Fix this",
      position: { side: "new", line: 5 },
    }),
    makeComment({
      id: "c2",
      filePath: "src/utils.py",
      body: "Refactor",
      position: { side: "new", line: 10 },
    }),
    makeComment({
      id: "c3",
      filePath: "src/main.py",
      body: "Add tests",
      position: { side: "new", line: 20 },
    }),
  ];

  it("renders all comments", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(CommentList, { comments, selectedIndex: 0 }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Fix this");
    expect(frame).toContain("Refactor");
    expect(frame).toContain("Add tests");
  });

  it("shows selection indicator", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(CommentList, { comments, selectedIndex: 1 }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    const lines = frame.split("\n");
    const refactorLine = lines.find((l: string) => l.includes("Refactor"));
    expect(refactorLine).toContain(">");
  });

  it("shows empty state when no comments", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(CommentList, { comments: [], selectedIndex: 0 }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("No comments");
  });

  it("calls onSelectComment when clicking a row", async () => {
    const onSelect = mock(() => {});
    const { mockMouse, renderOnce } = await testRender(
      createElement(CommentList, {
        comments,
        selectedIndex: 0,
        onSelectComment: onSelect,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    await mockMouse.click(10, 2);
    await renderOnce();
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("shows line numbers for each comment", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(CommentList, { comments, selectedIndex: 0 }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("L5");
    expect(frame).toContain("L10");
    expect(frame).toContain("L20");
  });

  it("shows range line numbers", async () => {
    const rangeComments = [
      makeComment({
        id: "r1",
        body: "Range comment",
        position: { side: "new", line: { start: 3, end: 7 } },
      }),
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(CommentList, {
        comments: rangeComments,
        selectedIndex: 0,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("L3-7");
    expect(frame).toContain("Range comment");
  });
});

// ── PromptPreview ──
describe("PromptPreview component", () => {
  it("renders prompt content", async () => {
    const prompt =
      "以下のレビューコメントに対応してください:\n\nsrc/main.py:L43\nFix this";
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(PromptPreview, { prompt, commentCount: 1 }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("main.py");
  });

  it("shows empty state when no comments", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(PromptPreview, { prompt: "", commentCount: 0 }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("No comments");
  });
});

// ── Header extras ──
describe("Header component (additional)", () => {
  it("renders zero comments", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(Header, {
        title: "unstaged changes",
        commentCount: 0,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("orbit:");
    expect(frame).toContain("unstaged");
  });
});

// ── HelpBar extras ──
describe("HelpBar component (additional)", () => {
  it("shows comment-list keybindings", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "comment-list" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("delete");
    expect(frame).toContain("edit");
    expect(frame).toContain("jump");
  });

  it("shows prompt-preview keybindings", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "prompt-preview" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("copy");
    expect(frame).toContain("back");
  });

  it("flash overrides mode help text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(HelpBar, { mode: "diff-view", flash: "Saved!" }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Saved!");
    expect(frame).not.toContain("comment");
  });
});

// ── DiffView extras ──
describe("DiffView component (additional)", () => {
  const file = makeFile();

  it("renders with split mode", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 1,
        comments: [],
        splitMode: true,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("main");
  });

  it("renders with maxHeight constraint", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 1,
        comments: [],
        splitMode: false,
        maxHeight: 10,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toBeDefined();
  });

  it("renders selection range highlight", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 3,
        comments: [],
        splitMode: false,
        selectionRange: { start: 2, end: 4 },
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toBeDefined();
  });

  it("shows multiple comments on same file", async () => {
    const comments = [
      makeComment({
        id: "c1",
        body: "First issue",
        position: { side: "new", line: 2 },
      }),
      makeComment({
        id: "c2",
        body: "Second issue",
        position: { side: "new", line: 2 },
      }),
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(DiffView, {
        file,
        cursorLine: 2,
        comments,
        splitMode: false,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("First issue");
    expect(frame).toContain("Second issue");
  });

  it("keeps cursor highlight on split-side padded rows", async () => {
    const splitPadFile = makeFile({
      rawDiff: `diff --git a/pad.ts b/pad.ts
--- a/pad.ts
+++ b/pad.ts
@@ -1,4 +1,3 @@
-a
-b
+B
 c
 d
`,
    });

    const max = getDisplayLineCount(splitPadFile.rawDiff, true);
    let paddedOnNew: number | null = null;
    for (let d = 1; d <= max; d++) {
      const src = displayLineToSourceLineSplit(splitPadFile.rawDiff, d);
      if (src.oldLine !== null && src.newLine === null) {
        paddedOnNew = d;
        break;
      }
    }
    expect(paddedOnNew).not.toBeNull();
    if (!paddedOnNew) return;

    let setCursorLine: ((line: number) => void) | null = null;
    let mountedRenderer: { destroy: () => void } | null = null;
    let restoreRightSet: (() => void) | null = null;
    const rightSetCalls: Array<{ line: number; color: DiffLineColor }> = [];

    function Harness() {
      const [cursor, setCursor] = useState(1);
      setCursorLine = setCursor;
      return createElement(DiffView, {
        file: splitPadFile,
        cursorLine: cursor,
        comments: [],
        splitMode: true,
        activeSide: "new",
      });
    }

    try {
      const { renderOnce, renderer } = await testRender(
        createElement(Harness),
        RENDER_OPTS,
      );
      mountedRenderer = renderer;
      await renderOnce();

      const diffNode = findDiffRenderable(renderer.root);
      expect(diffNode).not.toBeNull();
      if (!diffNode) return;

      const rightSide = (
        diffNode as DiffRenderable & {
          rightSide?: {
            setLineColor: (line: number, color: DiffLineColor) => void;
          };
        }
      ).rightSide;
      expect(rightSide).toBeDefined();
      if (!rightSide) return;
      const originalRightSet = rightSide.setLineColor.bind(rightSide);
      rightSide.setLineColor = (line: number, color: DiffLineColor) => {
        rightSetCalls.push({ line, color });
        originalRightSet(line, color);
      };
      restoreRightSet = () => {
        rightSide.setLineColor = originalRightSet;
      };

      await act(async () => {
        setCursorLine?.(paddedOnNew);
        await renderOnce();
      });

      const hasCursorColorOnPadded = rightSetCalls.some(
        (c) => c.line === paddedOnNew - 1 && c.color === COLORS.cursorLine,
      );
      expect(hasCursorColorOnPadded).toBeTrue();
    } finally {
      if (restoreRightSet) restoreRightSet();
      if (mountedRenderer) {
        await act(async () => {
          mountedRenderer?.destroy();
        });
      }
    }
  });
});
