import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { formatDiffRange } from "./cli/args.ts";
import { CommentForm } from "./components/comment-form.tsx";
import { CommentList } from "./components/comment-list.tsx";
import { DiffView } from "./components/diff-view.tsx";
import { FileList } from "./components/file-list.tsx";
import { Header } from "./components/header.tsx";
import { HelpBar } from "./components/help-bar.tsx";
import { PromptPreview } from "./components/prompt-preview.tsx";
import { commentStore } from "./data/comment-store.ts";
import { getLineFromDiff } from "./data/diff-parser.ts";
import { formatPrompt, formatSingleComment } from "./data/prompt-formatter.ts";
import { shutdown } from "./index.tsx";
import type {
  AppMode,
  CliOptions,
  CrevDiffFile,
  ReviewComment,
} from "./types.ts";
import { copyToClipboard } from "./utils/clipboard.ts";
import { openInEditor } from "./utils/editor.ts";

interface AppProps {
  files: CrevDiffFile[];
  options: CliOptions;
}

export function App({ files, options }: AppProps) {
  const { width, height } = useTerminalDimensions();
  const comments = useSyncExternalStore(
    commentStore.subscribe,
    commentStore.getSnapshot,
  );

  // App state
  const [mode, setMode] = useState<AppMode>("file-list");
  const [fileIndex, setFileIndex] = useState(0);
  const [cursorLine, setCursorLine] = useState(1);
  const [commentIndex, setCommentIndex] = useState(0);
  const [splitMode, setSplitMode] = useState(options.splitMode);
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState("");
  const [editingComment, setEditingComment] = useState<ReviewComment | null>(
    null,
  );

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((msg: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(msg);
    flashTimer.current = setTimeout(() => setFlash(""), 2000);
  }, []);

  const currentFile = files[fileIndex];
  const diffRange = formatDiffRange(options);

  // Build rawDiffs map for prompt formatter
  const rawDiffs = new Map<string, string>();
  for (const f of files) {
    rawDiffs.set(f.path, f.rawDiff);
  }

  // Compute max line from diff for cursor bounds
  function getMaxLine(rawDiff: string): number {
    let max = 1;
    const lines = rawDiff.split("\n");
    for (const line of lines) {
      const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const start = parseInt(match[1]!, 10);
        const count = parseInt(match[2] ?? "1", 10);
        max = Math.max(max, start + count - 1);
      }
    }
    return max;
  }

  // Navigate between files
  function goToFile(index: number) {
    const clamped = Math.max(0, Math.min(index, files.length - 1));
    setFileIndex(clamped);
    setCursorLine(1);
  }

  // Find next/prev comment in current file
  function jumpToComment(direction: 1 | -1) {
    if (!currentFile) return;
    const fileComments = comments
      .filter((c) => c.filePath === currentFile.path)
      .sort((a, b) => {
        const aLine =
          typeof a.position.line === "number"
            ? a.position.line
            : a.position.line.start;
        const bLine =
          typeof b.position.line === "number"
            ? b.position.line
            : b.position.line.start;
        return aLine - bLine;
      });

    if (fileComments.length === 0) return;

    if (direction === 1) {
      const next = fileComments.find((c) => {
        const line =
          typeof c.position.line === "number"
            ? c.position.line
            : c.position.line.start;
        return line > cursorLine;
      });
      if (next) {
        setCursorLine(
          typeof next.position.line === "number"
            ? next.position.line
            : next.position.line.start,
        );
      }
    } else {
      const prev = [...fileComments].reverse().find((c) => {
        const line =
          typeof c.position.line === "number"
            ? c.position.line
            : c.position.line.start;
        return line < cursorLine;
      });
      if (prev) {
        setCursorLine(
          typeof prev.position.line === "number"
            ? prev.position.line
            : prev.position.line.start,
        );
      }
    }
  }

  useKeyboard((key) => {
    // Comment input mode: only handle Ctrl+E (textarea handles rest)
    if (mode === "comment-input") {
      if (key.ctrl && key.name === "e") {
        const result = openInEditor(editingComment?.body ?? "");
        if (result !== null) {
          handleCommentSubmit(result);
        }
        return;
      }
      return;
    }

    // File list mode
    if (mode === "file-list") {
      switch (key.name) {
        case "q":
          shutdown();
          return;
        case "j":
        case "down":
          setFileIndex((i) => Math.min(i + 1, files.length - 1));
          return;
        case "k":
        case "up":
          setFileIndex((i) => Math.max(i - 1, 0));
          return;
        case "return":
          if (currentFile) {
            setMode("diff-view");
            setCursorLine(1);
          }
          return;
        case "space":
          if (currentFile) {
            setViewedFiles((prev) => {
              const next = new Set(prev);
              if (next.has(currentFile.path)) {
                next.delete(currentFile.path);
              } else {
                next.add(currentFile.path);
              }
              return next;
            });
          }
          return;
        case "tab":
          // Jump to next file with comments
          for (let offset = 1; offset <= files.length; offset++) {
            const idx = (fileIndex + offset) % files.length;
            const f = files[idx];
            if (f && comments.some((c) => c.filePath === f.path)) {
              setFileIndex(idx);
              return;
            }
          }
          return;
        case "t":
          setSplitMode((s) => !s);
          return;
      }

      // Shift+C or uppercase C
      if (key.name === "c" && key.shift) {
        setMode("comment-list");
        setCommentIndex(0);
        return;
      }
      if (key.name === "p" && key.shift) {
        setMode("prompt-preview");
        return;
      }
      return;
    }

    // Diff view mode
    if (mode === "diff-view") {
      if (!currentFile) return;
      const maxLine = getMaxLine(currentFile.rawDiff);

      switch (key.name) {
        case "escape":
        case "q":
          setMode("file-list");
          return;
        case "j":
        case "down":
          if (key.shift) {
            setCursorLine((l) => Math.min(l + 10, maxLine));
          } else {
            setCursorLine((l) => Math.min(l + 1, maxLine));
          }
          return;
        case "k":
        case "up":
          if (key.shift) {
            setCursorLine((l) => Math.max(l - 10, 1));
          } else {
            setCursorLine((l) => Math.max(l - 1, 1));
          }
          return;
        case "g":
          // gg → go to top (simplified: single g goes to top)
          setCursorLine(1);
          return;
        case "c":
          if (!key.shift) {
            setMode("comment-input");
            setEditingComment(null);
          } else {
            setMode("comment-list");
            setCommentIndex(0);
          }
          return;
        case "n":
          if (key.shift) {
            jumpToComment(-1);
          } else {
            jumpToComment(1);
          }
          return;
        case "tab":
          if (key.shift) {
            goToFile(fileIndex - 1);
          } else {
            goToFile(fileIndex + 1);
          }
          return;
        case "t":
          setSplitMode((s) => !s);
          return;
      }

      // G → go to bottom
      if (key.name === "g" && key.shift) {
        setCursorLine(maxLine);
        return;
      }
      return;
    }

    // Comment list mode
    if (mode === "comment-list") {
      switch (key.name) {
        case "escape":
          setMode("file-list");
          return;
        case "j":
        case "down":
          setCommentIndex((i) => Math.min(i + 1, comments.length - 1));
          return;
        case "k":
        case "up":
          setCommentIndex((i) => Math.max(i - 1, 0));
          return;
        case "return": {
          const selected = comments[commentIndex];
          if (selected) {
            const fIdx = files.findIndex((f) => f.path === selected.filePath);
            if (fIdx >= 0) {
              setFileIndex(fIdx);
              setCursorLine(
                typeof selected.position.line === "number"
                  ? selected.position.line
                  : selected.position.line.start,
              );
              setMode("diff-view");
            }
          }
          return;
        }
        case "e": {
          const selected = comments[commentIndex];
          if (selected) {
            setEditingComment(selected);
            const fIdx = files.findIndex((f) => f.path === selected.filePath);
            if (fIdx >= 0) setFileIndex(fIdx);
            setMode("comment-input");
          }
          return;
        }
        case "d": {
          const selected = comments[commentIndex];
          if (selected) {
            commentStore.remove(selected.id);
            setCommentIndex((i) =>
              Math.max(0, Math.min(i, comments.length - 2)),
            );
            showFlash("Comment deleted");
          }
          return;
        }
        case "y": {
          if (key.shift) {
            // Y: copy all comments as prompt
            const prompt = formatPrompt(comments, { rawDiffs });
            if (copyToClipboard(prompt)) {
              showFlash(`Copied ${comments.length} comments as prompt`);
            }
          } else {
            // y: copy single comment
            const selected = comments[commentIndex];
            if (selected) {
              const prompt = formatSingleComment(
                selected,
                rawDiffs.get(selected.filePath),
              );
              if (copyToClipboard(prompt)) {
                showFlash("Copied comment");
              }
            }
          }
          return;
        }
      }
      return;
    }

    // Prompt preview mode
    if (mode === "prompt-preview") {
      switch (key.name) {
        case "escape":
          setMode("file-list");
          return;
        case "y": {
          const prompt = formatPrompt(comments, { rawDiffs });
          if (copyToClipboard(prompt)) {
            showFlash("Prompt copied to clipboard");
          }
          return;
        }
      }
      return;
    }
  });

  function handleCommentSubmit(body: string) {
    if (editingComment) {
      commentStore.update(editingComment.id, body);
      showFlash("Comment updated");
    } else if (currentFile) {
      const codeLine = getLineFromDiff(currentFile.rawDiff, cursorLine, "new");
      const comment: ReviewComment = {
        id: crypto.randomUUID(),
        filePath: currentFile.path,
        body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        position: { side: "new", line: cursorLine },
        codeSnapshot: codeLine ? { content: codeLine } : undefined,
        resolved: false,
      };
      commentStore.add(comment);
      showFlash("Comment added");
    }
    setEditingComment(null);
    setMode("diff-view");
  }

  function handleCommentCancel() {
    setEditingComment(null);
    setMode("diff-view");
  }

  // Header title
  const headerTitle =
    mode === "file-list"
      ? `${diffRange}  (${files.length} files, ${comments.length} comments)`
      : mode === "diff-view" && currentFile
        ? `${currentFile.path} [${currentFile.status[0]?.toUpperCase()}] +${currentFile.additions}/-${currentFile.deletions}  ${splitMode ? "split" : "unified"}`
        : mode === "comment-input"
          ? `Comment on ${currentFile?.path ?? ""}:L${cursorLine}`
          : mode === "comment-list"
            ? `All Comments (${comments.length})`
            : `Prompt Preview (${comments.filter((c) => !c.resolved).length} comments)`;

  return (
    <box flexDirection="column" width={width} height={height}>
      <Header title={headerTitle} commentCount={comments.length} />

      {mode === "file-list" && (
        <FileList
          files={files}
          selectedIndex={fileIndex}
          comments={comments}
          viewedFiles={viewedFiles}
        />
      )}

      {mode === "diff-view" && currentFile && (
        <DiffView
          file={currentFile}
          cursorLine={cursorLine}
          comments={comments}
          splitMode={splitMode}
        />
      )}

      {mode === "comment-input" && currentFile && (
        <CommentForm
          filePath={currentFile.path}
          line={cursorLine}
          side="new"
          codeLine={
            getLineFromDiff(currentFile.rawDiff, cursorLine, "new") ?? undefined
          }
          onSubmit={handleCommentSubmit}
          onCancel={handleCommentCancel}
          onEditorOpen={() => {}}
          initialBody={editingComment?.body}
        />
      )}

      {mode === "comment-list" && (
        <CommentList comments={comments} selectedIndex={commentIndex} />
      )}

      {mode === "prompt-preview" && (
        <PromptPreview
          prompt={formatPrompt(comments, { rawDiffs })}
          commentCount={comments.filter((c) => !c.resolved).length}
        />
      )}

      <HelpBar mode={mode} flash={flash} />
    </box>
  );
}
