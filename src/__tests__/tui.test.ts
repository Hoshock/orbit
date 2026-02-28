import { describe, expect, it, mock } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { createElement } from "react";
import { CommentList } from "../components/comment-list.tsx";
import { DiffView } from "../components/diff-view.tsx";
import { FileList } from "../components/file-list.tsx";
import { Header } from "../components/header.tsx";
import { HelpBar } from "../components/help-bar.tsx";
import { PromptPreview } from "../components/prompt-preview.tsx";
import type { DiffFile, ReviewComment } from "../types.ts";

const RENDER_OPTS = { width: 80, height: 24 };

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

// ── FileList ──
describe("FileList component", () => {
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

  it("renders file list with paths", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 0,
        comments: [],
        viewedFiles: new Set<string>(),
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("src/main.py");
    expect(frame).toContain("src/utils.py");
    expect(frame).toContain("tests/old.py");
  });

  it("shows selection indicator on selected file", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 1,
        comments: [],
        viewedFiles: new Set<string>(),
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    // Selected file should have ">" indicator
    const lines = frame.split("\n");
    const utilsLine = lines.find((l: string) => l.includes("src/utils.py"));
    expect(utilsLine).toContain(">");
  });

  it("shows comment counts per file", async () => {
    const comments = [
      makeComment({ id: "c1", filePath: "src/main.py" }),
      makeComment({ id: "c2", filePath: "src/main.py" }),
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 0,
        comments,
        viewedFiles: new Set<string>(),
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    const mainLine = frame
      .split("\n")
      .find((l: string) => l.includes("src/main.py"));
    expect(mainLine).toContain("2");
  });

  it("calls onSelectFile when clicking a row", async () => {
    const onSelect = mock(() => {});
    const { mockMouse, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 0,
        comments: [],
        viewedFiles: new Set<string>(),
        onSelectFile: onSelect,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    // Click on y=1 (second file row, 0-indexed)
    await mockMouse.click(10, 1);
    await renderOnce();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("calls onOpenFile on double-click", async () => {
    const onOpen = mock(() => {});
    const onSelect = mock(() => {});
    const { mockMouse, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 0,
        comments: [],
        viewedFiles: new Set<string>(),
        onSelectFile: onSelect,
        onOpenFile: onOpen,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    // Double-click on first row
    await mockMouse.click(10, 0);
    await renderOnce();
    await mockMouse.click(10, 0);
    await renderOnce();
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it("shows addition/deletion counts", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 0,
        comments: [],
        viewedFiles: new Set<string>(),
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("+10");
    expect(frame).toContain("-5");
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

// ── FileList extras ──
describe("FileList component (additional)", () => {
  it("shows viewed checkmark", async () => {
    const files = [
      makeFile({ path: "src/main.py" }),
      makeFile({ path: "src/utils.py" }),
    ];
    const viewed = new Set(["src/main.py"]);
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 1,
        comments: [],
        viewedFiles: viewed,
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    const mainLine = frame
      .split("\n")
      .find((l: string) => l.includes("src/main.py"));
    expect(mainLine).toContain("\u2713");
  });

  it("handles single file", async () => {
    const files = [makeFile({ path: "only-file.ts" })];
    const { captureCharFrame, renderOnce } = await testRender(
      createElement(FileList, {
        files,
        selectedIndex: 0,
        comments: [],
        viewedFiles: new Set<string>(),
      }),
      RENDER_OPTS,
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("only-file.ts");
    expect(frame).toContain(">");
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
