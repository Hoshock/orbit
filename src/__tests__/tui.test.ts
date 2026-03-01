import { describe, expect, it, mock } from "bun:test";
import { setMaxListeners } from "node:events";
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
import { commentStore } from "../data/comment-store.ts";
import type { DiffFile, ReviewComment } from "../types.ts";
import { buildFileTree, flattenTree } from "../utils/file-tree.ts";

const RENDER_OPTS = { width: 80, height: 24 };
process.env.ORBIT_DISABLE_TREESITTER = "1";
setMaxListeners(50);

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

function findDiffRenderable(root: {
  getChildren: () => unknown[];
}): (DiffRenderable & { buildView: (...args: unknown[]) => unknown }) | null {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (cur instanceof DiffRenderable) {
      const withBuild = cur as DiffRenderable & {
        buildView?: (...args: unknown[]) => unknown;
      };
      if (typeof withBuild.buildView === "function") {
        return withBuild as DiffRenderable & {
          buildView: (...args: unknown[]) => unknown;
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
});
