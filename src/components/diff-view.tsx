import { getTreeSitterClient } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef } from "react";
import { COLORS } from "../constants.ts";
import {
  displayLineToSourceLine,
  displayLineToSourceLineSplit,
  getDisplayLineCount,
  sourceLineToDisplayLine,
  sourceLineToDisplayLineSplit,
} from "../data/diff-parser.ts";
import { syntaxStyle } from "../theme.ts";
import type { DiffFile, ReviewComment } from "../types.ts";
import { getFiletype } from "../utils/filetype.ts";

interface DiffViewProps {
  file: DiffFile;
  cursorLine: number;
  comments: ReviewComment[];
  splitMode: boolean;
  activeSide?: "old" | "new";
  selectionRange?: { start: number; end: number } | null;
  markerLines?: Map<number, number>;
  maxHeight?: number;
  onCursorChange?: (line: number) => void;
}

export function DiffView({
  file,
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
  const diffRef = useRef<any>(null);
  const scrollRef = useRef<any>(null);
  // Track scroll position in a ref to avoid relying on scrollbox's internal
  // scrollTop which can get reset/clamped when the scrollbox height changes
  // (e.g. comment-input half-height → diff-view full-height transition).
  const scrollTopRef = useRef(0);

  const totalLines = useMemo(
    () => getDisplayLineCount(file.rawDiff, splitMode),
    [file.rawDiff, splitMode],
  );

  // Memoize to prevent unnecessary effect runs
  const fileComments = useMemo(
    () => comments.filter((c) => c.filePath === file.path),
    [comments, file.path],
  );

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

  // Rebuild native diff colors, then layer cursor/comment colors on top.
  // buildView() restores native red/green from the parsed diff.
  // setLineColor() adds without clearing, so custom colors overwrite natives.
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

    // In split mode, use leftSide/rightSide (private but runtime-accessible)
    // to color only the relevant panel instead of the full row.
    const getSideTarget = (side: "old" | "new") =>
      side === "old" ? diff.leftSide : diff.rightSide;

    // 1.5. Fold marker highlights (lowest custom priority)
    if (markerLines) {
      // DEBUG: cross-check markerLines against actual diff content
      const diffLines = file.rawDiff.split("\n");
      let dbgLine = 0;
      let dbgInHunk = false;
      const actualMarkers = new Map<number, string>();
      for (const line of diffLines) {
        if (line.startsWith("@@")) {
          dbgInHunk = true;
          continue;
        }
        if (!dbgInHunk || line.length === 0) continue;
        const ch = line[0];
        if (ch === "+" || ch === "-" || ch === " ") {
          dbgLine++;
          if (line.includes(" lines hidden (z to expand) ")) {
            actualMarkers.set(dbgLine, line.slice(0, 60));
          }
        } else if (ch === "\\") {
          /* skip */
        } else {
          dbgInHunk = false;
        }
      }
      console.error("[FOLD-DEBUG] markerLines from collapseDiff:", [
        ...markerLines.entries(),
      ]);
      console.error("[FOLD-DEBUG] actual markers in diff string:", [
        ...actualMarkers.entries(),
      ]);
      // Show surrounding lines for each marker position
      for (const [dispLine] of markerLines) {
        let scanLine = 0;
        let scanInHunk = false;
        for (const line of diffLines) {
          if (line.startsWith("@@")) {
            scanInHunk = true;
            continue;
          }
          if (!scanInHunk || line.length === 0) continue;
          const ch = line[0];
          if (ch === "+" || ch === "-" || ch === " ") {
            scanLine++;
            if (scanLine >= dispLine - 1 && scanLine <= dispLine + 1) {
              // biome-ignore lint/suspicious/noConsole: temporary debug
              console.error(
                `[FOLD-DEBUG] display ${scanLine}: ${line.slice(0, 80)}`,
              );
            }
          } else if (ch === "\\") {
            /* skip */
          } else {
            scanInHunk = false;
          }
        }
      }

      for (const [dispLine] of markerLines) {
        if (splitMode) {
          diff.leftSide?.setLineColor(dispLine - 1, COLORS.foldMarker);
          diff.rightSide?.setLineColor(dispLine - 1, COLORS.foldMarker);
        } else {
          diff.setLineColor(dispLine - 1, COLORS.foldMarker);
        }
      }
    }

    // 2. Comment highlights (lower priority, applied first)
    // position.line is a source line; convert to display line for setLineColor (0-indexed)
    const toDispLine = splitMode
      ? sourceLineToDisplayLineSplit
      : sourceLineToDisplayLine;
    for (const c of fileComments) {
      const target = splitMode ? getSideTarget(c.position.side) : diff;
      if (!target) continue;
      if (typeof c.position.line === "number" && c.position.line > 0) {
        const dispLine = toDispLine(
          file.rawDiff,
          c.position.line,
          c.position.side,
        );
        if (dispLine)
          target.setLineColor(dispLine - 1, COLORS.commentHighlight);
      } else if (typeof c.position.line === "object") {
        for (let l = c.position.line.start; l <= c.position.line.end; l++) {
          const dispLine = toDispLine(file.rawDiff, l, c.position.side);
          if (dispLine)
            target.setLineColor(dispLine - 1, COLORS.commentHighlight);
        }
      }
    }

    // 3. Cursor/selection (highest priority, applied last to overwrite)
    // In split mode, only highlight the active side's panel.
    const cursorTarget = splitMode ? getSideTarget(activeSide) : diff;
    if (cursorTarget) {
      if (selectionRange) {
        for (let l = selectionRange.start; l <= selectionRange.end; l++) {
          cursorTarget.setLineColor(l - 1, COLORS.cursorLine);
        }
      } else if (cursorLine > 0) {
        cursorTarget.setLineColor(cursorLine - 1, COLORS.cursorLine);
      }
    }

    // 4. Scroll: only scroll when cursor goes out of visible area
    const sb = scrollRef.current;
    if (sb) {
      const row = cursorLine - 1;
      const maxScrollTop = Math.max(0, totalLines - diffHeight);
      let top = Math.min(scrollTopRef.current, maxScrollTop);

      if (row < top) {
        top = row;
      } else if (row >= top + diffHeight) {
        top = row - diffHeight + 1;
      }
      top = Math.min(top, maxScrollTop);
      sb.scrollTop = top;
      scrollTopRef.current = top;
    }
  }, [
    cursorLine,
    selectionRange,
    fileComments,
    diffHeight,
    totalLines,
    splitMode,
    activeSide,
    file.rawDiff,
    markerLines,
  ]);

  return (
    <box flexDirection="column" height={availableHeight}>
      <scrollbox
        ref={scrollRef}
        height={diffHeight}
        width={width}
        onMouseDown={(event: any) => {
          if (!onCursorChange) return;
          const line = scrollTopRef.current + event.y + 1;
          onCursorChange(Math.max(1, line));
        }}
      >
        <diff
          ref={diffRef}
          diff={file.rawDiff}
          view={splitMode ? "split" : "unified"}
          wrapMode="none"
          width={width}
          syntaxStyle={syntaxStyle}
          filetype={getFiletype(file.path)}
          treeSitterClient={getTreeSitterClient()}
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
