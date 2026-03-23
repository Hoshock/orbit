import {
  getTreeSitterClient,
  type MouseEvent,
  type RGBA,
  type ScrollBoxRenderable,
} from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS } from "../constants.ts";
import {
  buildSplitDisplayLineTypeMap,
  displayLineToSourceLine,
  displayLineToSourceLineSplit,
  getDiffLineType,
  getDisplayLineCount,
  sourceLineToDisplayLine,
  sourceLineToDisplayLineSplit,
} from "../data/diff-parser.ts";
import { syntaxStyle } from "../theme.ts";
import type { DiffFile, ReviewComment } from "../types.ts";
import { getFiletype } from "../utils/filetype.ts";
import {
  type DiffSyntaxRuntime,
  installProjectedDiffSyntaxHighlighting,
} from "./diff-syntax-highlighting.ts";

interface DiffViewProps {
  file: DiffFile;
  fullDiff?: string;
  cursorLine: number;
  comments: ReviewComment[];
  splitMode: boolean;
  activeSide?: "old" | "new";
  selectionRange?: { start: number; end: number } | null;
  markerLines?: Map<number, number>;
  maxHeight?: number;
  onCursorChange?: (line: number, side?: "old" | "new") => void;
}

type LineColorTarget = {
  setLineColor: (line: number, color: LineColor) => void;
  clearLineColor: (line: number) => void;
};

type LineColor =
  | string
  | RGBA
  | { gutter?: string | RGBA; content?: string | RGBA };

type DiffRuntime = DiffSyntaxRuntime & {
  leftSide?: LineColorTarget;
  rightSide?: LineColorTarget;
};

export function DiffView({
  file,
  fullDiff,
  cursorLine,
  comments,
  splitMode,
  activeSide = "new",
  selectionRange,
  markerLines,
  maxHeight,
  onCursorChange,
}: DiffViewProps) {
  const { width, height } = useTerminalDimensions();
  const diffRef = useRef<DiffRuntime | null>(null);
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  const highlightDiffsRef = useRef({
    fullDiff: "",
    visibleDiff: "",
  });
  const treeSitterClient = useMemo(
    () =>
      process.env.ORBIT_DISABLE_TREESITTER === "1"
        ? undefined
        : getTreeSitterClient(),
    [],
  );
  const highlightSourceDiff = fullDiff ?? file.rawDiff;
  highlightDiffsRef.current = {
    fullDiff: highlightSourceDiff,
    visibleDiff: file.rawDiff,
  };
  const rawFiletype = useMemo(() => getFiletype(file.path), [file.path]);
  // Track scroll position in a ref to avoid relying on scrollbox's internal
  // scrollTop which can get reset/clamped when the scrollbox height changes
  // (e.g. comment-input half-height → diff-view full-height transition).
  const scrollTopRef = useRef(0);
  // Base overlay colors (marker/comment) by display line and side.
  // Cursor/selection colors are applied on top and restored from this map.
  const baseColorsRef = useRef<{
    unified: Map<number, string>;
    old: Map<number, string>;
    new: Map<number, string>;
  }>({
    unified: new Map(),
    old: new Map(),
    new: new Map(),
  });
  const prevHighlightRef = useRef<{
    side: "unified" | "old" | "new";
    start: number;
    end: number;
  } | null>(null);
  const prevCursorLineRef = useRef(cursorLine);
  const [overlayRevision, setOverlayRevision] = useState(0);

  const totalLines = useMemo(
    () => getDisplayLineCount(file.rawDiff, splitMode),
    [file.rawDiff, splitMode],
  );
  const splitDisplayLineTypes = useMemo(
    () => (splitMode ? buildSplitDisplayLineTypeMap(file.rawDiff) : null),
    [file.rawDiff, splitMode],
  );

  // Memoize to prevent unnecessary effect runs
  const fileComments = useMemo(
    () => comments.filter((c) => c.filePath === file.path),
    [comments, file.path],
  );

  useEffect(() => {
    return installProjectedDiffSyntaxHighlighting({
      diff: diffRef.current,
      splitMode,
      rawFiletype,
      treeSitterClient,
      highlightDiffsRef,
    });
  }, [splitMode, rawFiletype, treeSitterClient]);

  // Side-aware comment matching: check comment's side against cursor's source line for that side
  const cursorSource = useMemo(
    () =>
      splitMode
        ? displayLineToSourceLineSplit(file.rawDiff, cursorLine)
        : displayLineToSourceLine(file.rawDiff, cursorLine),
    [file.rawDiff, cursorLine, splitMode],
  );

  const currentComments = useMemo(
    () =>
      fileComments.filter((c) => {
        // In split mode, only show comments for the focused panel
        if (splitMode && c.position.side !== activeSide) return false;
        const matchLine =
          c.position.side === "new"
            ? cursorSource.newLine
            : cursorSource.oldLine;
        if (matchLine === null) return false;
        if (typeof c.position.line === "number")
          return c.position.line === matchLine;
        return (
          matchLine >= c.position.line.start && matchLine <= c.position.line.end
        );
      }),
    [fileComments, cursorSource, splitMode, activeSide],
  );

  const commentPanelHeight =
    currentComments.length > 0
      ? Math.min(currentComments.length * 2 + 1, 8)
      : 0;
  const availableHeight = maxHeight ?? height - 2;
  const diffHeight = availableHeight - commentPanelHeight;

  // Rebuild native diff colors and apply base overlays (marker/comment).
  // This is the expensive path and should run only when underlying diff/base
  // overlays change, not on every cursor move.
  useEffect(() => {
    const diff = diffRef.current;
    if (!diff) return;

    // 1. Rebuild to restore native diff colors (red/green for +/- lines)
    if (typeof diff.buildView === "function") {
      diff.buildView();
      // Cancel any pending requestRebuild microtask queued by prop setters
      // (in split mode, rebuildView() → requestRebuild() queues a microtask
      // that would call buildView() again and wipe our custom line colors)
      if ("pendingRebuild" in diff) diff.pendingRebuild = false;
    }

    const base = {
      unified: new Map<number, string>(),
      old: new Map<number, string>(),
      new: new Map<number, string>(),
    };
    const setBaseColor = (
      side: "unified" | "old" | "new",
      displayLine: number,
      color: string,
    ) => {
      if (displayLine <= 0) return;
      base[side].set(displayLine, color);
      if (!splitMode) {
        diff.setLineColor(displayLine - 1, color);
        return;
      }
      if (side === "old") {
        diff.leftSide?.setLineColor(displayLine - 1, color);
      } else if (side === "new") {
        diff.rightSide?.setLineColor(displayLine - 1, color);
      } else {
        diff.leftSide?.setLineColor(displayLine - 1, color);
        diff.rightSide?.setLineColor(displayLine - 1, color);
      }
    };

    // 1.5. Fold marker highlights (lowest custom priority)
    if (markerLines) {
      for (const [dispLine] of markerLines) {
        if (splitMode) {
          setBaseColor("old", dispLine, COLORS.foldMarker);
          setBaseColor("new", dispLine, COLORS.foldMarker);
        } else setBaseColor("unified", dispLine, COLORS.foldMarker);
      }
    }

    // 2. Comment highlights (higher than marker, lower than cursor)
    // position.line is a source line; convert to display line for setLineColor (0-indexed)
    const toDispLine = splitMode
      ? sourceLineToDisplayLineSplit
      : sourceLineToDisplayLine;
    for (const c of fileComments) {
      const side = splitMode ? c.position.side : "unified";
      if (typeof c.position.line === "number" && c.position.line > 0) {
        const dispLine = toDispLine(
          file.rawDiff,
          c.position.line,
          c.position.side,
        );
        if (dispLine) setBaseColor(side, dispLine, COLORS.commentHighlight);
      } else if (typeof c.position.line === "object") {
        for (let l = c.position.line.start; l <= c.position.line.end; l++) {
          const dispLine = toDispLine(file.rawDiff, l, c.position.side);
          if (dispLine) setBaseColor(side, dispLine, COLORS.commentHighlight);
        }
      }
    }

    baseColorsRef.current = base;
    prevHighlightRef.current = null;
    setOverlayRevision((v) => v + 1);
  }, [file.rawDiff, splitMode, fileComments, markerLines]);

  // Apply cursor/selection overlay and maintain scroll position.
  // This runs on cursor movement without triggering a full buildView().
  useEffect(() => {
    const diff = diffRef.current;
    if (!diff) return;
    // Depend on base-overlay rebuilds so cursor highlight is reapplied.
    void overlayRevision;

    const getTarget = (side: "unified" | "old" | "new") =>
      side === "unified"
        ? diff
        : side === "old"
          ? diff.leftSide
          : diff.rightSide;
    const getNativeLineColor = (
      side: "unified" | "old" | "new",
      displayLine: number,
    ) => {
      if (displayLine <= 0) return null;
      const toColor = (t: "+" | "-" | " " | null): LineColor | null => {
        if (t === "+") {
          return {
            gutter: diff.addedLineNumberBg,
            content: diff.addedContentBg ?? diff.addedBg,
          };
        }
        if (t === "-") {
          return {
            gutter: diff.removedLineNumberBg,
            content: diff.removedContentBg ?? diff.removedBg,
          };
        }
        if (t === " ") {
          return {
            gutter: diff.lineNumberBg,
            content: diff.contextContentBg ?? diff.contextBg,
          };
        }
        return null;
      };

      if (!splitMode || side === "unified") {
        return toColor(getDiffLineType(file.rawDiff, displayLine));
      }
      const row = splitDisplayLineTypes?.[displayLine];
      if (!row) return null;
      if (side === "old") return toColor(row.old);
      return toColor(row.new);
    };
    const restoreBaseRange = (
      side: "unified" | "old" | "new",
      start: number,
      end: number,
    ) => {
      if (end < start) return;
      const target = getTarget(side);
      if (!target) return;
      const baseMap = baseColorsRef.current[side];
      for (let l = start; l <= end; l++) {
        if (l <= 0) continue;
        const baseColor = baseMap.get(l);
        if (baseColor) target.setLineColor(l - 1, baseColor);
        else {
          const nativeColor = getNativeLineColor(side, l);
          if (nativeColor) target.setLineColor(l - 1, nativeColor);
          else target.clearLineColor(l - 1);
        }
      }
    };

    const prev = prevHighlightRef.current;
    if (prev) {
      restoreBaseRange(prev.side, prev.start, prev.end);
    }

    const side: "unified" | "old" | "new" = splitMode ? activeSide : "unified";
    const start = selectionRange ? selectionRange.start : cursorLine;
    const end = selectionRange ? selectionRange.end : cursorLine;
    const target = getTarget(side);
    if (target && end >= start) {
      for (let l = start; l <= end; l++) {
        if (l > 0) target.setLineColor(l - 1, COLORS.cursorLine);
      }
    }
    prevHighlightRef.current = { side, start, end };

    // Scroll: only scroll when cursor goes out of visible area
    const sb = scrollRef.current;
    if (sb) {
      const prevCursorLine = prevCursorLineRef.current;
      const row = cursorLine - 1;
      const maxScrollTop = Math.max(0, totalLines - diffHeight);
      const currentTop = Math.floor(
        Math.min(Math.max(sb.scrollTop, 0), maxScrollTop),
      );
      let top = currentTop;

      if (row < top) {
        top = row;
      } else if (row >= top + diffHeight) {
        top = row - diffHeight + 1;
      }
      const prevRow = prevCursorLine - 1;
      const wasPrevVisible =
        prevRow >= currentTop && prevRow < currentTop + diffHeight;
      if (wasPrevVisible) {
        // While the previous cursor row is visible, keep viewport movement
        // incremental to prevent visible shake from transient input ordering.
        top = Math.max(currentTop - 1, Math.min(currentTop + 1, top));
      }
      top = Math.min(top, maxScrollTop);
      if (sb.scrollTop !== top) sb.scrollTop = top;
      scrollTopRef.current = top;
    }
    prevCursorLineRef.current = cursorLine;
  }, [
    cursorLine,
    selectionRange,
    diffHeight,
    totalLines,
    splitMode,
    activeSide,
    overlayRevision,
    file.rawDiff,
    splitDisplayLineTypes,
  ]);

  const handleClick = (event: MouseEvent) => {
    if (!onCursorChange) return;
    if (event.type !== "down" || event.button !== 0 || event.isDragging) return;
    const currentTop = Math.max(
      0,
      Math.floor(scrollRef.current?.scrollTop ?? scrollTopRef.current),
    );
    scrollTopRef.current = currentTop;
    // OpenTUI mouse local `y` is 1-based inside renderables.
    const line = currentTop + event.y;
    const clampedLine = Math.min(Math.max(1, line), totalLines);
    if (splitMode) {
      const clickedSide: "old" | "new" =
        event.x < Math.floor(width / 2) ? "old" : "new";
      const row = splitDisplayLineTypes?.[clampedLine];
      if (!row) return;
      if (clickedSide === "old" && row.old === null) return;
      if (clickedSide === "new" && row.new === null) return;
      onCursorChange(clampedLine, clickedSide);
      return;
    }
    onCursorChange(clampedLine);
  };

  return (
    <box flexDirection="column" height={availableHeight}>
      <scrollbox ref={scrollRef} height={diffHeight} width={width}>
        <diff
          ref={diffRef}
          diff={file.rawDiff}
          view={splitMode ? "split" : "unified"}
          wrapMode="none"
          width={width}
          syntaxStyle={syntaxStyle}
          filetype={rawFiletype}
          treeSitterClient={treeSitterClient}
          onMouseDown={(event: MouseEvent) => {
            handleClick(event);
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </scrollbox>
      {currentComments.length > 0 ? (
        <box flexDirection="column" height={commentPanelHeight} width={width}>
          <text color={COLORS.headerDim} width={width}>
            {" --- comments ---"}
          </text>
          {currentComments.map((c) => {
            const lineStr =
              typeof c.position.line === "number"
                ? String(c.position.line)
                : `${String(c.position.line.start)}-${String(c.position.line.end)}`;
            const firstLine = c.body.split("\n")[0] ?? "";
            return (
              <text key={c.id} color={COLORS.comment} width={width}>
                {`  L${lineStr} (${c.position.side}): ${firstLine}`}
              </text>
            );
          })}
        </box>
      ) : null}
    </box>
  );
}
