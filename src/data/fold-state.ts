import { type CollapsedDiff, collapseDiff } from "./diff-collapse.ts";
import {
  displayLineToSourceLine,
  displayLineToSourceLineSplit,
  findNearestFoldIdByDisplayLine,
  markerLinesUnifiedToSplit,
  sourceLineToDisplayLine,
  sourceLineToDisplayLineSplit,
} from "./diff-parser.ts";
import { getExpandChunk } from "./fold-controls.ts";

type DiffSide = "old" | "new";

interface AnchorInfo {
  line: number;
  side: DiffSide;
}

interface FoldTransitionParams {
  fullDiff: string;
  activeDiff: string;
  visibleDiff: CollapsedDiff;
  cursorLine: number;
  splitMode: boolean;
  activeSide: DiffSide;
  markerLinesForView?: Map<number, number>;
  expandedFolds: Map<number, number>;
  markerWidth: number;
  incrementalFoldLines: number;
  fullFoldRequested: boolean;
}

export interface FoldTransitionResult {
  changed: boolean;
  expandedFolds: Map<number, number>;
  cursorLine: number;
  flash: string;
}

function resolveAnchorInfo(
  rawDiff: string,
  displayLine: number,
  splitMode: boolean,
  activeSide: DiffSide,
): AnchorInfo | null {
  const source = splitMode
    ? displayLineToSourceLineSplit(rawDiff, displayLine)
    : displayLineToSourceLine(rawDiff, displayLine);

  if (splitMode) {
    const line = activeSide === "new" ? source.newLine : source.oldLine;
    return line !== null ? { line, side: activeSide } : null;
  }

  if (source.newLine !== null) return { line: source.newLine, side: "new" };
  if (source.oldLine !== null) return { line: source.oldLine, side: "old" };
  return null;
}

function sourceLineToDisplayLineForMode(
  rawDiff: string,
  line: number,
  side: DiffSide,
  splitMode: boolean,
): number | null {
  return splitMode
    ? sourceLineToDisplayLineSplit(rawDiff, line, side)
    : sourceLineToDisplayLine(rawDiff, line, side);
}

function markerLinesForMode(
  result: CollapsedDiff,
  splitMode: boolean,
): Map<number, number> {
  return splitMode
    ? markerLinesUnifiedToSplit(result.diff, result.markerLines)
    : result.markerLines;
}

function findMarkerDisplayLine(
  markerLines: Map<number, number>,
  foldId: number,
): number | null {
  for (const [displayLine, markerFoldId] of markerLines) {
    if (markerFoldId === foldId) return displayLine;
  }
  return null;
}

function buildFullFoldTransition({
  fullDiff,
  activeDiff,
  visibleDiff,
  cursorLine,
  splitMode,
  activeSide,
  expandedFolds,
  markerWidth,
}: FoldTransitionParams): FoldTransitionResult {
  if (visibleDiff.folds.length === 0) {
    return {
      changed: false,
      expandedFolds,
      cursorLine,
      flash: "No folds in file",
    };
  }

  const allExpanded = visibleDiff.folds.every(
    (fold) => (expandedFolds.get(fold.id) ?? 0) >= fold.hiddenCount,
  );
  const nextExpandedFolds = new Map(expandedFolds);
  let nextCursorLine = 1;

  if (allExpanded) {
    for (const fold of visibleDiff.folds) {
      nextExpandedFolds.delete(fold.id);
    }

    const collapsed = collapseDiff(fullDiff, nextExpandedFolds, markerWidth);
    const nearestFoldId = findNearestFoldIdByDisplayLine(
      activeDiff,
      visibleDiff.folds,
      cursorLine,
      splitMode,
    );
    if (nearestFoldId !== null) {
      nextCursorLine =
        findMarkerDisplayLine(
          markerLinesForMode(collapsed, splitMode),
          nearestFoldId,
        ) ?? 1;
    }

    return {
      changed: true,
      expandedFolds: nextExpandedFolds,
      cursorLine: nextCursorLine,
      flash: `Collapsed all folds (${visibleDiff.folds.length} regions)`,
    };
  }

  let expandedFoldCount = 0;
  let revealedLineCount = 0;
  for (const fold of visibleDiff.folds) {
    const revealed = expandedFolds.get(fold.id) ?? 0;
    if (revealed >= fold.hiddenCount) continue;
    nextExpandedFolds.set(fold.id, fold.hiddenCount);
    expandedFoldCount++;
    revealedLineCount += fold.hiddenCount - revealed;
  }

  const expanded = collapseDiff(fullDiff, nextExpandedFolds, markerWidth);
  const anchorInfo = resolveAnchorInfo(
    activeDiff,
    cursorLine,
    splitMode,
    activeSide,
  );
  nextCursorLine = anchorInfo
    ? (sourceLineToDisplayLineForMode(
        expanded.diff,
        anchorInfo.line,
        anchorInfo.side,
        splitMode,
      ) ?? 1)
    : 1;

  return {
    changed: true,
    expandedFolds: nextExpandedFolds,
    cursorLine: nextCursorLine,
    flash: `Expanded all folds (${expandedFoldCount} regions, +${revealedLineCount} lines)`,
  };
}

export function getFoldTransition(
  params: FoldTransitionParams,
): FoldTransitionResult | null {
  const {
    fullDiff,
    activeDiff,
    visibleDiff,
    cursorLine,
    splitMode,
    activeSide,
    markerLinesForView,
    expandedFolds,
    markerWidth,
    incrementalFoldLines,
    fullFoldRequested,
  } = params;

  if (fullFoldRequested) {
    return buildFullFoldTransition(params);
  }

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
      return {
        changed: false,
        expandedFolds,
        cursorLine,
        flash: "No fold nearby",
      };
    }

    targetFoldId = nearestFoldId;
    const nearestFold = visibleDiff.folds.find(
      (fold) => fold.id === nearestFoldId,
    );
    if (!nearestFold) return null;
    const revealed = expandedFolds.get(nearestFold.id) ?? 0;
    action = revealed >= nearestFold.hiddenCount ? "collapse" : "expand";
  }

  const fold = visibleDiff.folds.find(
    (candidate) => candidate.id === targetFoldId,
  );
  if (!fold) return null;

  const nextExpandedFolds = new Map(expandedFolds);
  const prevRevealed = expandedFolds.get(targetFoldId) ?? 0;

  if (action === "expand") {
    const chunk = getExpandChunk(
      fold.hiddenCount,
      prevRevealed,
      incrementalFoldLines,
      false,
    );
    nextExpandedFolds.set(
      targetFoldId,
      Math.min(prevRevealed + chunk, fold.hiddenCount),
    );
  } else {
    nextExpandedFolds.delete(targetFoldId);
  }

  const nextVisibleDiff = collapseDiff(
    fullDiff,
    nextExpandedFolds,
    markerWidth,
  );
  const anchorInfo = resolveAnchorInfo(
    activeDiff,
    cursorLine,
    splitMode,
    activeSide,
  );

  let nextCursorLine = 1;
  if (action === "collapse") {
    nextCursorLine =
      findMarkerDisplayLine(
        markerLinesForMode(nextVisibleDiff, splitMode),
        targetFoldId,
      ) ?? 1;
  } else if (anchorInfo) {
    nextCursorLine =
      sourceLineToDisplayLineForMode(
        nextVisibleDiff.diff,
        anchorInfo.line,
        anchorInfo.side,
        splitMode,
      ) ?? 1;
  }

  if (action === "collapse") {
    return {
      changed: true,
      expandedFolds: nextExpandedFolds,
      cursorLine: nextCursorLine,
      flash: `Collapsed L${fold.newLineStart}-${fold.newLineEnd} (${fold.hiddenCount} lines)`,
    };
  }

  const revealed = nextExpandedFolds.get(targetFoldId) ?? 0;
  const chunk = revealed - prevRevealed;
  const remaining = fold.hiddenCount - revealed;
  return {
    changed: true,
    expandedFolds: nextExpandedFolds,
    cursorLine: nextCursorLine,
    flash:
      remaining > 0
        ? `+${chunk} lines (${remaining} still hidden)`
        : `Fully expanded (${fold.hiddenCount} lines)`,
  };
}
