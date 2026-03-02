import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatDiffRange } from "./cli/args.ts";
import { CommentForm } from "./components/comment-form.tsx";
import { CommentList } from "./components/comment-list.tsx";
import { DiffView } from "./components/diff-view.tsx";
import { Header } from "./components/header.tsx";
import { HelpBar } from "./components/help-bar.tsx";
import { HomeScreen } from "./components/home-screen.tsx";
import { PromptPreview } from "./components/prompt-preview.tsx";
import { commentStore } from "./data/comment-store.ts";
import { collapseDiff, FOLD_CHUNK_SIZE } from "./data/diff-collapse.ts";
import {
  buildSplitDisplayLineTypeMap,
  displayLineToSourceLine,
  displayLineToSourceLineSplit,
  displayRangeToSourceRange,
  displayRangeToSourceRangeSplit,
  findNearestFoldIdByDisplayLine,
  findNextDisplayLineForSideSplit,
  getDisplayLineCount,
  getLineFromDiff,
  markerLinesUnifiedToSplit,
  sourceLineToDisplayLine,
  sourceLineToDisplayLineSplit,
} from "./data/diff-parser.ts";
import {
  DEFAULT_ORBIT_CONFIG,
  saveSessionPrefs,
  saveSessionViewedFiles,
} from "./data/persistence.ts";
import { formatPrompt } from "./data/prompt-formatter.ts";
import type {
  AppMode,
  CliOptions,
  DiffFile,
  OrbitConfig,
  ReviewComment,
} from "./types.ts";
import { copyToClipboard } from "./utils/clipboard.ts";
import { buildFileTree, flattenTree } from "./utils/file-tree.ts";

interface AppProps {
  files: DiffFile[];
  options: CliOptions;
  initialViewedFiles?: Set<string>;
  sessionCachePath?: string;
  initialPrefs?: Record<string, unknown>;
  config?: OrbitConfig;
  configPath?: string;
  onQuit: () => void;
}

function isBindingPressed(
  key: { name?: string; raw?: string },
  binding: string,
): boolean {
  const normalized = binding.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return (
    key.name?.toLowerCase() === normalized ||
    key.raw?.toLowerCase() === normalized
  );
}

export function App({
  files,
  options,
  initialViewedFiles,
  sessionCachePath,
  initialPrefs,
  config,
  onQuit,
}: AppProps) {
  const { width, height } = useTerminalDimensions();
  const renderer = useRenderer();

  // Recover from terminal focus changes (e.g. cmux/tmux workspace switch).
  //
  // OpenTUI's stdinListener processes mouse data BEFORE input handlers.
  // If a focus-in sequence (\x1b[I) arrives in the same data chunk as mouse
  // data, handleMouseData() consumes the entire chunk and the focus event is
  // lost.  We intercept stdin BEFORE OpenTUI (via prependListener) to
  // reliably detect focus-in, then defer the actual reset to avoid
  // re-entrant issues with the render loop.
  useEffect(() => {
    let pending = false;
    const resetMouseState = () => {
      if (pending) return;
      pending = true;
      setImmediate(() => {
        pending = false;
        const r = renderer as typeof renderer & {
          setCapturedRenderable?: (renderable: unknown) => void;
          mouseParser?: { reset?: () => void };
        };
        r.setCapturedRenderable?.(undefined);
        r.mouseParser?.reset?.();
        if (renderer.hasSelection) renderer.clearSelection();
        renderer.currentRenderBuffer.clear();
        renderer.intermediateRender();
      });
    };

    const onStdin = (data: Buffer) => {
      if (data.toString().includes("\x1b[I")) {
        resetMouseState();
      }
    };
    process.stdin.prependListener("data", onStdin);
    renderer.on("focus", resetMouseState);

    return () => {
      process.stdin.removeListener("data", onStdin);
      renderer.off("focus", resetMouseState);
    };
  }, [renderer]);

  const comments = useSyncExternalStore(
    commentStore.subscribe,
    commentStore.getSnapshot,
  );

  const [mode, setMode] = useState<AppMode>("file-list");
  const [fileIndex, setFileIndex] = useState(0);
  const [cursorLine, setCursorLine] = useState(1);
  const [commentIndex, setCommentIndex] = useState(0);
  const [splitMode, setSplitMode] = useState(options.splitMode);
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(
    () => initialViewedFiles ?? new Set(),
  );
  const [flash, setFlash] = useState("");
  const [editingComment, setEditingComment] = useState<ReviewComment | null>(
    null,
  );
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  // In split mode: which side is focused ("old" = before, "new" = after)
  const [activeSide, setActiveSide] = useState<"old" | "new">("new");
  const keybindings = config?.keybindings ?? DEFAULT_ORBIT_CONFIG.keybindings;
  const fileTreeKeys = keybindings.fileTree;
  const diffViewKeys = keybindings.diffView;
  const commentListKeys = keybindings.commentList;
  const promptPreviewKeys = keybindings.promptPreview;

  // Persist viewed files to cache on change
  useEffect(() => {
    if (sessionCachePath) {
      saveSessionViewedFiles(sessionCachePath, viewedFiles);
    }
  }, [viewedFiles, sessionCachePath]);

  // Tree state for file-list mode
  const [treeIndex, setTreeIndex] = useState(0);
  const [previewSplitMode, setPreviewSplitMode] = useState(options.splitMode);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [treePercent, setTreePercent] = useState(() => {
    const saved = initialPrefs?.treePercent;
    return typeof saved === "number" && saved >= 0.1 && saved <= 0.5
      ? saved
      : (config?.fileTreeInitialWidth ??
          DEFAULT_ORBIT_CONFIG.fileTreeInitialWidth);
  });

  // Persist tree width to prefs on change
  useEffect(() => {
    if (sessionCachePath) {
      saveSessionPrefs(sessionCachePath, { treePercent });
    }
  }, [treePercent, sessionCachePath]);

  // Fold/unfold state: file path → (foldId → revealedLines)
  const [expandedFolds, setExpandedFolds] = useState<
    Map<string, Map<number, number>>
  >(new Map());

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const flatRows = useMemo(
    () => flattenTree(fileTree, files, collapsedDirs),
    [fileTree, files, collapsedDirs],
  );

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((msg: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(msg);
    flashTimer.current = setTimeout(() => setFlash(""), 2000);
  }, []);

  const currentFile = files[fileIndex];
  const diffRange = formatDiffRange(options);

  // Collapsed diff for the current file (fold/unfold)
  const markerWidth = splitMode ? Math.floor(width / 2) : width;
  const visibleDiff = useMemo(() => {
    if (!currentFile) return null;
    const exp = expandedFolds.get(currentFile.path) ?? new Map();
    return collapseDiff(currentFile.rawDiff, exp, markerWidth);
  }, [currentFile, expandedFolds, markerWidth]);
  const activeDiff = visibleDiff?.diff ?? currentFile?.rawDiff ?? "";
  const markerLinesForView = useMemo(() => {
    if (!visibleDiff) return undefined;
    if (!splitMode) return visibleDiff.markerLines;
    return markerLinesUnifiedToSplit(activeDiff, visibleDiff.markerLines);
  }, [visibleDiff, splitMode, activeDiff]);
  const splitDisplayLineTypes = useMemo(
    () => (splitMode ? buildSplitDisplayLineTypeMap(activeDiff) : null),
    [splitMode, activeDiff],
  );

  const pendingRangeRef = useRef<{ start: number; end: number } | null>(null);

  const selectionRange =
    selectionAnchor !== null
      ? {
          start: Math.min(selectionAnchor, cursorLine),
          end: Math.max(selectionAnchor, cursorLine),
        }
      : mode === "comment-input" && pendingRangeRef.current
        ? pendingRangeRef.current
        : null;

  // ── Mode-aware conversion helpers ──
  function resolveSource(
    rawDiff: string,
    displayLine: number,
  ): { oldLine: number | null; newLine: number | null } {
    return splitMode
      ? displayLineToSourceLineSplit(rawDiff, displayLine)
      : displayLineToSourceLine(rawDiff, displayLine);
  }

  /** Get { line, side } for comment storage. In split mode uses activeSide. */
  function resolveLineAndSide(
    rawDiff: string,
    displayLine: number,
  ): { line: number; side: "old" | "new" } | null {
    const src = resolveSource(rawDiff, displayLine);
    if (splitMode) {
      const line = activeSide === "new" ? src.newLine : src.oldLine;
      return line !== null ? { line, side: activeSide } : null;
    }
    if (src.newLine !== null) return { line: src.newLine, side: "new" };
    if (src.oldLine !== null) return { line: src.oldLine, side: "old" };
    return null;
  }

  function resolveRangeAndSide(
    rawDiff: string,
    start: number,
    end: number,
  ): { start: number; end: number; side: "old" | "new" } | null {
    if (splitMode) {
      return displayRangeToSourceRangeSplit(rawDiff, start, end, activeSide);
    }
    return displayRangeToSourceRange(rawDiff, start, end);
  }

  function resolveDisplayLine(
    rawDiff: string,
    sourceLine: number,
    side: "old" | "new",
  ): number | null {
    return splitMode
      ? sourceLineToDisplayLineSplit(rawDiff, sourceLine, side)
      : sourceLineToDisplayLine(rawDiff, sourceLine, side);
  }

  function findCommentAtLine(displayLine: number): ReviewComment | undefined {
    if (!currentFile) return undefined;
    const src = resolveSource(activeDiff, displayLine);
    return comments.find((c) => {
      if (c.filePath !== currentFile.path) return false;
      const matchLine = c.position.side === "new" ? src.newLine : src.oldLine;
      if (matchLine === null) return false;
      if (typeof c.position.line === "number")
        return c.position.line === matchLine;
      return (
        matchLine >= c.position.line.start && matchLine <= c.position.line.end
      );
    });
  }

  function startComment(linePos: number | { start: number; end: number }) {
    setEditingComment(null);
    if (typeof linePos === "number") {
      setCursorLine(linePos);
      pendingRangeRef.current = null;
    } else {
      setCursorLine(linePos.start);
      pendingRangeRef.current = linePos;
    }
    setSelectionAnchor(null);
    setMode("comment-input");
  }

  useKeyboard((key) => {
    if (mode === "comment-input") {
      if (key.name === "escape") {
        handleCommentCancel();
      }
      return;
    }

    if (mode === "file-list") {
      switch (key.name) {
        case "escape":
          onQuit();
          return;
        case "down":
          setTreeIndex((i) => Math.min(i + 1, flatRows.length - 1));
          return;
        case "up":
          setTreeIndex((i) => Math.max(i - 1, 0));
          return;
        case "left": {
          const row = flatRows[treeIndex];
          if (!row) return;
          if (row.node.isDir && !collapsedDirs.has(row.node.path)) {
            setCollapsedDirs((prev) => {
              const next = new Set(prev);
              next.add(row.node.path);
              return next;
            });
          } else {
            const parentPath = row.node.path.includes("/")
              ? row.node.path.slice(0, row.node.path.lastIndexOf("/"))
              : null;
            if (parentPath) {
              const parentIdx = flatRows.findIndex(
                (r) => r.node.path === parentPath && r.node.isDir,
              );
              if (parentIdx >= 0) setTreeIndex(parentIdx);
            }
          }
          return;
        }
        case "right": {
          const row = flatRows[treeIndex];
          if (row?.node.isDir && collapsedDirs.has(row.node.path)) {
            setCollapsedDirs((prev) => {
              const next = new Set(prev);
              next.delete(row.node.path);
              return next;
            });
          }
          return;
        }
        case "return": {
          const row = flatRows[treeIndex];
          if (!row) return;
          if (row.node.isDir) {
            setCollapsedDirs((prev) => {
              const next = new Set(prev);
              if (next.has(row.node.path)) {
                next.delete(row.node.path);
              } else {
                next.add(row.node.path);
              }
              return next;
            });
          } else if (row.fileIndex !== null) {
            setFileIndex(row.fileIndex);
            setCursorLine(1);
            setMode("diff-view");
          }
          return;
        }
      }

      if (isBindingPressed(key, fileTreeKeys.quit)) {
        onQuit();
        return;
      }
      if (isBindingPressed(key, fileTreeKeys.toggleViewMode)) {
        setPreviewSplitMode((s) => !s);
        return;
      }
      if (isBindingPressed(key, fileTreeKeys.toggleViewed)) {
        const row = flatRows[treeIndex];
        if (row && row.fileIndex !== null && row.node.file) {
          const path = row.node.file.path;
          setViewedFiles((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
              next.delete(path);
            } else {
              next.add(path);
            }
            return next;
          });
        }
        return;
      }
      if (isBindingPressed(key, fileTreeKeys.commentList)) {
        setMode("comment-list");
        setCommentIndex(0);
        return;
      }
      if (isBindingPressed(key, fileTreeKeys.promptPreview)) {
        setMode("prompt-preview");
        return;
      }
      if (isBindingPressed(key, fileTreeKeys.treeShrink)) {
        setTreePercent((p) => Math.max(0.1, Math.round((p - 0.05) * 20) / 20));
        return;
      }
      if (isBindingPressed(key, fileTreeKeys.treeGrow)) {
        setTreePercent((p) => Math.min(0.5, Math.round((p + 0.05) * 20) / 20));
        return;
      }
      return;
    }

    if (mode === "diff-view") {
      if (!currentFile) return;
      const maxLine = getDisplayLineCount(activeDiff, splitMode);

      switch (key.name) {
        case "escape":
          if (selectionAnchor !== null) {
            setSelectionAnchor(null);
          } else {
            setMode("file-list");
          }
          return;
        case "down": {
          const nextLine = splitMode
            ? findNextDisplayLineForSideSplit(
                activeDiff,
                cursorLine,
                activeSide,
                1,
                splitDisplayLineTypes ?? undefined,
              )
            : Math.min(cursorLine + 1, maxLine);

          if (key.shift) {
            if (selectionAnchor === null) setSelectionAnchor(cursorLine);
            if (nextLine !== cursorLine) setCursorLine(nextLine);
          } else {
            if (selectionAnchor !== null) setSelectionAnchor(null);
            if (nextLine !== cursorLine) setCursorLine(nextLine);
          }
          return;
        }
        case "up": {
          const nextLine = splitMode
            ? findNextDisplayLineForSideSplit(
                activeDiff,
                cursorLine,
                activeSide,
                -1,
                splitDisplayLineTypes ?? undefined,
              )
            : Math.max(cursorLine - 1, 1);

          if (key.shift) {
            if (selectionAnchor === null) setSelectionAnchor(cursorLine);
            if (nextLine !== cursorLine) setCursorLine(nextLine);
          } else {
            if (selectionAnchor !== null) setSelectionAnchor(null);
            if (nextLine !== cursorLine) setCursorLine(nextLine);
          }
          return;
        }
        case "left":
          if (splitMode) setActiveSide("old");
          return;
        case "right":
          if (splitMode) setActiveSide("new");
          return;
      }

      if (isBindingPressed(key, diffViewKeys.quit)) {
        setSelectionAnchor(null);
        setMode("file-list");
        return;
      }
      if (isBindingPressed(key, diffViewKeys.comment)) {
        if (markerLinesForView?.has(cursorLine)) {
          showFlash("Cannot comment on fold marker");
          return;
        }
        if (selectionRange) {
          for (let l = selectionRange.start; l <= selectionRange.end; l++) {
            if (markerLinesForView?.has(l)) {
              showFlash("Selection includes fold marker");
              return;
            }
          }
          const rangeInfo = resolveRangeAndSide(
            activeDiff,
            selectionRange.start,
            selectionRange.end,
          );
          if (!rangeInfo) {
            showFlash("No lines on this side");
            return;
          }
          startComment(selectionRange);
        } else {
          const info = resolveLineAndSide(activeDiff, cursorLine);
          if (!info) {
            showFlash("No line on this side");
            return;
          }
          startComment(cursorLine);
        }
        return;
      }
      if (isBindingPressed(key, diffViewKeys.fileComment)) {
        setCursorLine(0);
        setEditingComment(null);
        pendingRangeRef.current = null;
        setMode("comment-input");
        return;
      }
      if (isBindingPressed(key, diffViewKeys.fold)) {
        if (!visibleDiff) return;

        let targetFoldId: number;
        let action: "expand" | "collapse";

        const markerFoldId = markerLinesForView?.get(cursorLine);
        if (markerFoldId !== undefined) {
          targetFoldId = markerFoldId;
          action = "expand";
        } else {
          const nearestFoldId = findNearestFoldIdByDisplayLine(
            activeDiff,
            visibleDiff.folds,
            cursorLine,
            splitMode,
          );
          if (nearestFoldId === null) {
            showFlash("No fold nearby");
            return;
          }
          targetFoldId = nearestFoldId;
          const expMap =
            expandedFolds.get(currentFile.path) ?? new Map<number, number>();
          const nearestFold = visibleDiff.folds.find(
            (f) => f.id === nearestFoldId,
          );
          if (!nearestFold) return;
          const revealed = expMap.get(nearestFold.id) ?? 0;
          action = revealed >= nearestFold.hiddenCount ? "collapse" : "expand";
        }

        const fold = visibleDiff.folds.find((f) => f.id === targetFoldId);
        if (!fold) return;

        const oldExpMap =
          expandedFolds.get(currentFile.path) ?? new Map<number, number>();
        const newExpMap = new Map(oldExpMap);
        const prevRevealed = oldExpMap.get(targetFoldId) ?? 0;

        if (action === "expand") {
          const chunk = Math.min(
            FOLD_CHUNK_SIZE,
            fold.hiddenCount - prevRevealed,
          );
          newExpMap.set(
            targetFoldId,
            Math.min(prevRevealed + chunk, fold.hiddenCount),
          );
        } else {
          newExpMap.delete(targetFoldId);
        }

        const newResult = collapseDiff(
          currentFile.rawDiff,
          newExpMap,
          markerWidth,
        );
        const anchorInfo = resolveLineAndSide(activeDiff, cursorLine);

        let newCursor = 1;
        if (action === "collapse") {
          const nextMarkerLines = splitMode
            ? markerLinesUnifiedToSplit(newResult.diff, newResult.markerLines)
            : newResult.markerLines;
          for (const [dispLine, fId] of nextMarkerLines) {
            if (fId === targetFoldId) {
              newCursor = dispLine;
              break;
            }
          }
        } else if (anchorInfo) {
          const dispLine = splitMode
            ? sourceLineToDisplayLineSplit(
                newResult.diff,
                anchorInfo.line,
                anchorInfo.side,
              )
            : sourceLineToDisplayLine(
                newResult.diff,
                anchorInfo.line,
                anchorInfo.side,
              );
          newCursor = dispLine ?? 1;
        }

        setExpandedFolds((prev) => {
          const next = new Map(prev);
          next.set(currentFile.path, newExpMap);
          return next;
        });
        setCursorLine(newCursor);

        if (action === "collapse") {
          showFlash(
            `Collapsed L${fold.newLineStart}-${fold.newLineEnd} (${fold.hiddenCount} lines)`,
          );
        } else {
          const remaining =
            fold.hiddenCount - (newExpMap.get(targetFoldId) ?? 0);
          const chunk = (newExpMap.get(targetFoldId) ?? 0) - prevRevealed;
          if (remaining > 0) {
            showFlash(`+${chunk} lines (${remaining} still hidden)`);
          } else {
            showFlash(`Fully expanded (${fold.hiddenCount} lines)`);
          }
        }
        return;
      }
      if (isBindingPressed(key, diffViewKeys.editComment)) {
        const existing = findCommentAtLine(cursorLine);
        if (existing) {
          setEditingComment(existing);
          pendingRangeRef.current = null;
          setMode("comment-input");
        }
        return;
      }
      if (isBindingPressed(key, diffViewKeys.deleteComment)) {
        const existing = findCommentAtLine(cursorLine);
        if (existing) {
          commentStore.remove(existing.id);
          showFlash("Comment deleted");
        }
        return;
      }
      if (isBindingPressed(key, diffViewKeys.toggleViewMode)) {
        setSplitMode((s) => !s);
        return;
      }
      if (isBindingPressed(key, diffViewKeys.toggleViewed)) {
        const path = currentFile.path;
        setViewedFiles((prev) => {
          const next = new Set(prev);
          if (next.has(path)) {
            next.delete(path);
            return next;
          }
          next.add(path);
          return next;
        });
        showFlash(
          viewedFiles.has(currentFile.path)
            ? "Unmarked as viewed"
            : "\u2713 Marked as viewed",
        );
      }
      return;
    }

    if (mode === "comment-list") {
      switch (key.name) {
        case "escape":
          setMode("file-list");
          return;
        case "down":
          setCommentIndex((i) => Math.min(i + 1, comments.length - 1));
          return;
        case "up":
          setCommentIndex((i) => Math.max(i - 1, 0));
          return;
        case "return": {
          const selected = comments[commentIndex];
          if (selected) {
            const fIdx = files.findIndex((f) => f.path === selected.filePath);
            if (fIdx >= 0) {
              setFileIndex(fIdx);
              const exp =
                expandedFolds.get(files[fIdx]!.path) ??
                new Map<number, number>();
              const collapsed = collapseDiff(files[fIdx]!.rawDiff, exp);
              const srcLine =
                typeof selected.position.line === "number"
                  ? selected.position.line
                  : selected.position.line.start;
              const dispLine = resolveDisplayLine(
                collapsed.diff,
                srcLine,
                selected.position.side,
              );
              setCursorLine(dispLine ?? 1);
              setActiveSide(selected.position.side);
              setMode("diff-view");
            }
          }
          return;
        }
      }

      if (isBindingPressed(key, commentListKeys.quit)) {
        setMode("file-list");
        return;
      }
      if (isBindingPressed(key, commentListKeys.editComment)) {
        const selected = comments[commentIndex];
        if (selected) {
          setEditingComment(selected);
          const fIdx = files.findIndex((f) => f.path === selected.filePath);
          if (fIdx >= 0) setFileIndex(fIdx);
          pendingRangeRef.current = null;
          const targetIdx = fIdx >= 0 ? fIdx : fileIndex;
          const exp =
            expandedFolds.get(files[targetIdx]!.path) ??
            new Map<number, number>();
          const collapsed = collapseDiff(files[targetIdx]!.rawDiff, exp);
          const srcLine =
            typeof selected.position.line === "number"
              ? selected.position.line
              : selected.position.line.start;
          const dispLine = resolveDisplayLine(
            collapsed.diff,
            srcLine,
            selected.position.side,
          );
          setCursorLine(dispLine ?? 1);
          setActiveSide(selected.position.side);
          setMode("comment-input");
        }
        return;
      }
      if (isBindingPressed(key, commentListKeys.deleteComment)) {
        const selected = comments[commentIndex];
        if (selected) {
          commentStore.remove(selected.id);
          setCommentIndex((i) => Math.max(0, Math.min(i, comments.length - 2)));
          showFlash("Comment deleted");
        }
      }
      return;
    }

    if (mode === "prompt-preview") {
      switch (key.name) {
        case "escape":
          setMode("file-list");
          return;
      }
      if (isBindingPressed(key, promptPreviewKeys.quit)) {
        setMode("file-list");
        return;
      }
      if (isBindingPressed(key, promptPreviewKeys.copyPrompt)) {
        const prompt = formatPrompt(comments, {
          oldHash: options.oldHash,
          newHash: options.newHash,
        });
        if (copyToClipboard(prompt)) {
          showFlash("Prompt copied to clipboard");
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
      const range = pendingRangeRef.current;
      const displayPos: number | { start: number; end: number } = range
        ? range.start === range.end
          ? range.start
          : range
        : cursorLine;

      let sourcePos: number | { start: number; end: number };
      let side: "old" | "new";
      let codeSnapshot: { content: string } | undefined;

      if (typeof displayPos === "number") {
        const info = resolveLineAndSide(activeDiff, displayPos);
        side = info?.side ?? "new";
        sourcePos = info?.line ?? displayPos;
        if (typeof sourcePos === "number" && sourcePos > 0) {
          const codeLine = getLineFromDiff(activeDiff, sourcePos, side);
          codeSnapshot = codeLine ? { content: codeLine } : undefined;
        }
      } else {
        const rangeInfo = resolveRangeAndSide(
          activeDiff,
          displayPos.start,
          displayPos.end,
        );
        side = rangeInfo?.side ?? activeSide;
        const start = rangeInfo?.start ?? displayPos.start;
        const end = rangeInfo?.end ?? displayPos.end;
        sourcePos = start === end ? start : { start, end };
        const sStart =
          typeof sourcePos === "number" ? sourcePos : sourcePos.start;
        const sEnd = typeof sourcePos === "number" ? sourcePos : sourcePos.end;
        const codeLines: string[] = [];
        for (let l = sStart; l <= sEnd; l++) {
          const line = getLineFromDiff(activeDiff, l, side);
          if (line) codeLines.push(line);
        }
        codeSnapshot =
          codeLines.length > 0 ? { content: codeLines.join("\n") } : undefined;
      }

      const comment: ReviewComment = {
        id: crypto.randomUUID(),
        filePath: currentFile.path,
        body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        position: { side, line: sourcePos },
        codeSnapshot,
        resolved: false,
      };
      commentStore.add(comment);
      showFlash("Comment added");
    }
    pendingRangeRef.current = null;
    setEditingComment(null);
    setMode("diff-view");
  }

  function handleCommentCancel() {
    pendingRangeRef.current = null;
    setEditingComment(null);
    setMode("diff-view");
  }

  // ── Header title ──
  function buildHeaderTitle(): string {
    if (mode === "file-list") {
      return `${diffRange}  (${files.length} files, ${comments.length} comments)`;
    }
    if ((mode === "diff-view" || mode === "comment-input") && currentFile) {
      const viewedMark = viewedFiles.has(currentFile.path) ? "\u2713 " : "";
      const filePart = `${viewedMark}${currentFile.path} [${currentFile.status[0]?.toUpperCase()}] +${currentFile.additions}/-${currentFile.deletions}`;
      if (mode === "comment-input") {
        if (cursorLine === 0) {
          return `Comment: ${currentFile.path} (file)`;
        }
        if (pendingRangeRef.current) {
          const rangeInfo = resolveRangeAndSide(
            activeDiff,
            pendingRangeRef.current.start,
            pendingRangeRef.current.end,
          );
          if (rangeInfo) {
            return `Comment: ${currentFile.path}:L${rangeInfo.start}-${rangeInfo.end} (${rangeInfo.side})`;
          }
        }
        const info = resolveLineAndSide(activeDiff, cursorLine);
        if (info) {
          return `Comment: ${currentFile.path}:L${info.line} (${info.side})`;
        }
        return `Comment: ${currentFile.path}:L${cursorLine}`;
      }
      // diff-view header
      const info = resolveLineAndSide(activeDiff, cursorLine);
      let linePart: string;
      if (info) {
        linePart = `L${info.line}(${info.side})`;
      } else {
        linePart = `L${cursorLine}`;
      }
      if (selectionRange) linePart += " VISUAL";
      const modePart = splitMode
        ? `split [${activeSide === "old" ? "OLD" : "old"}|${activeSide === "new" ? "NEW" : "new"}]`
        : "unified";
      return `${filePart}  ${linePart}  ${modePart}`;
    }
    if (mode === "comment-list") {
      return `All Comments (${comments.length})`;
    }
    return `Prompt Preview (${comments.filter((c) => !c.resolved).length} comments)`;
  }

  const showDiff =
    (mode === "diff-view" || (mode === "comment-input" && cursorLine > 0)) &&
    currentFile;

  return (
    <box flexDirection="column" width={width} height={height}>
      <Header title={buildHeaderTitle()} commentCount={comments.length} />

      {mode === "file-list" ? (
        <HomeScreen
          files={files}
          rows={flatRows}
          selectedIndex={treeIndex}
          comments={comments}
          viewedFiles={viewedFiles}
          collapsedDirs={collapsedDirs}
          previewSplitMode={previewSplitMode}
          treePercent={treePercent}
          expandedFolds={expandedFolds}
          onTreeResize={setTreePercent}
          onSelectRow={(i) => setTreeIndex(i)}
          onOpenFile={(rowIdx) => {
            const row = flatRows[rowIdx];
            if (!row) return;
            if (row.node.isDir) {
              setCollapsedDirs((prev) => {
                const next = new Set(prev);
                if (next.has(row.node.path)) {
                  next.delete(row.node.path);
                } else {
                  next.add(row.node.path);
                }
                return next;
              });
            } else if (row.fileIndex !== null) {
              setFileIndex(row.fileIndex);
              setCursorLine(1);
              setMode("diff-view");
            }
          }}
        />
      ) : null}

      {showDiff ? (
        <DiffView
          file={{ ...currentFile, rawDiff: activeDiff }}
          cursorLine={cursorLine}
          comments={comments}
          splitMode={splitMode}
          activeSide={activeSide}
          selectionRange={selectionRange}
          markerLines={markerLinesForView}
          maxHeight={
            mode === "comment-input"
              ? Math.max(Math.floor((height - 2) * 0.5), 6)
              : undefined
          }
          onCursorChange={
            mode === "diff-view"
              ? (line, side) => {
                  const maxLine = getDisplayLineCount(activeDiff, splitMode);
                  setCursorLine(Math.min(line, maxLine));
                  if (splitMode && side) setActiveSide(side);
                }
              : undefined
          }
        />
      ) : null}

      {mode === "comment-input" && cursorLine === 0 && currentFile ? (
        <box flexGrow={1} />
      ) : null}

      {mode === "comment-input" && currentFile
        ? (() => {
            let srcLine = 0;
            let srcSide: "old" | "new" = activeSide;
            if (cursorLine > 0) {
              const info = resolveLineAndSide(activeDiff, cursorLine);
              if (info) {
                srcLine = info.line;
                srcSide = info.side;
              }
            }
            const rangeInfo = pendingRangeRef.current
              ? resolveRangeAndSide(
                  activeDiff,
                  pendingRangeRef.current.start,
                  pendingRangeRef.current.end,
                )
              : null;
            if (rangeInfo) {
              srcSide = rangeInfo.side;
              srcLine = rangeInfo.start;
            }
            return (
              <CommentForm
                filePath={currentFile.path}
                line={srcLine}
                lineRange={rangeInfo}
                side={srcSide}
                codeLine={
                  srcLine > 0
                    ? (getLineFromDiff(activeDiff, srcLine, srcSide) ??
                      undefined)
                    : undefined
                }
                onSubmit={handleCommentSubmit}
                onCancel={handleCommentCancel}
                initialBody={editingComment?.body}
                maxHeight={
                  cursorLine === 0 ? height - 4 : Math.floor((height - 2) * 0.5)
                }
              />
            );
          })()
        : null}

      {mode === "comment-list" ? (
        <CommentList
          comments={comments}
          selectedIndex={commentIndex}
          onSelectComment={(i) => setCommentIndex(i)}
        />
      ) : null}

      {mode === "prompt-preview" ? (
        <PromptPreview
          prompt={formatPrompt(comments, {
            oldHash: options.oldHash,
            newHash: options.newHash,
          })}
          commentCount={comments.filter((c) => !c.resolved).length}
        />
      ) : null}

      <HelpBar
        mode={mode}
        flash={flash}
        splitMode={mode === "file-list" ? previewSplitMode : splitMode}
        keybindings={keybindings}
      />
    </box>
  );
}
