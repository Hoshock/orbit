/** Number of context lines to keep around changes. */
const CONTEXT_LINES = 3;
/** Minimum consecutive context lines to qualify for folding. */
const MIN_FOLDABLE = CONTEXT_LINES * 2 + 1;

/** Number of lines to reveal per incremental unfold step. */
export const FOLD_CHUNK_SIZE = 20;

/** Substring used to identify fold marker lines in the diff output. */
export const FOLD_MARKER_PATTERN = " lines hidden (z/Z to expand) ";

export interface FoldRegion {
  id: number;
  /** Lines hidden when folded. */
  hiddenCount: number;
  /** Source line range (new side) of the foldable zone. */
  newLineStart: number;
  newLineEnd: number;
}

export interface CollapsedDiff {
  diff: string;
  folds: FoldRegion[];
  /** Maps 1-indexed display line positions to fold IDs for marker lines. */
  markerLines: Map<number, number>;
}

/**
 * Collapse a full-context unified diff, hiding long unchanged sections.
 * `expanded` maps fold IDs to the number of revealed lines (incremental unfold).
 * A fold is fully expanded when revealed >= hiddenCount.
 * `contentWidth` controls the width of fold marker lines (centered text).
 */
export function collapseDiff(
  fullDiff: string,
  expanded: Map<number, number>,
  contentWidth = 80,
): CollapsedDiff {
  const emptyResult: CollapsedDiff = {
    diff: fullDiff,
    folds: [],
    markerLines: new Map(),
  };

  const lines = fullDiff.split("\n");

  // Find header end (before first @@)
  let headerEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith("@@")) {
      headerEnd = i;
      break;
    }
  }
  if (headerEnd < 0) return emptyResult;

  // Parse content lines with source line tracking
  const entries = parseEntries(lines, headerEnd);
  if (entries.length === 0) return emptyResult;

  // Find foldable context zones
  const zones = findFoldableZones(entries);
  if (zones.length === 0) return emptyResult;

  // Build FoldRegion array
  const folds: FoldRegion[] = zones.map((z) => ({
    id: z.foldId,
    hiddenCount: z.length - CONTEXT_LINES * 2,
    newLineStart: entries[z.startIdx]!.newNum,
    newLineEnd: entries[z.endIdx]!.newNum,
  }));

  // Mark which entries are visible (supports partial expansion)
  const visible = new Array<boolean>(entries.length).fill(true);
  for (const zone of zones) {
    const revealed = expanded.get(zone.foldId) ?? 0;
    const hiddenCount = zone.length - CONTEXT_LINES * 2;
    if (revealed >= hiddenCount) continue; // fully expanded
    const foldStart = zone.startIdx + CONTEXT_LINES + revealed;
    const foldEnd = zone.endIdx - CONTEXT_LINES;
    for (let i = foldStart; i <= foldEnd; i++) {
      visible[i] = false;
    }
  }

  // Precompute marker insertion points (first hidden entry of each fold)
  const markerAt = new Map<
    number,
    { foldId: number; remaining: number; oldNum: number; newNum: number }
  >();
  for (const zone of zones) {
    const revealed = expanded.get(zone.foldId) ?? 0;
    const hiddenCount = zone.length - CONTEXT_LINES * 2;
    const remaining = hiddenCount - revealed;
    if (remaining <= 0) continue;
    const firstHiddenIdx = zone.startIdx + CONTEXT_LINES + revealed;
    const entry = entries[firstHiddenIdx];
    if (entry) {
      markerAt.set(firstHiddenIdx, {
        foldId: zone.foldId,
        remaining,
        oldNum: entry.oldNum,
        newNum: entry.newNum,
      });
    }
  }

  // Group visible entries into hunks, inserting fold markers at boundaries
  const header = lines.slice(0, headerEnd);
  const output: string[] = [...header];
  // Track fold IDs in insertion order for display-line mapping
  const markerFoldIds: number[] = [];

  let inHunk = false;
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  let hunkOldCount = 0;
  let hunkNewCount = 0;
  let hunkLines: string[] = [];

  const flushHunk = () => {
    if (!inHunk || hunkLines.length === 0) return;
    output.push(
      `@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@`,
    );
    output.push(...hunkLines);
    inHunk = false;
    hunkLines = [];
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    if (entry.type === "hunk") {
      // Skip original hunk headers; we generate our own
      continue;
    }

    if (!visible[i]) {
      // Check if this is the first hidden entry → insert fold marker
      const info = markerAt.get(i);
      if (info) {
        // Flush current hunk before marker
        flushHunk();
        // Insert marker as a single-line hunk at the hidden zone's start
        const markerText = buildMarkerText(info.remaining, contentWidth);
        output.push(`@@ -${info.oldNum},1 +${info.newNum},1 @@`);
        output.push(markerText);
        markerFoldIds.push(info.foldId);
      }
      continue;
    }

    // Visible entry
    if (!inHunk) {
      inHunk = true;
      hunkOldStart = entry.oldNum;
      hunkNewStart = entry.newNum;
      hunkOldCount = 0;
      hunkNewCount = 0;
      hunkLines = [];
    }

    hunkLines.push(entry.raw);
    if (entry.type === "ctx") {
      hunkOldCount++;
      hunkNewCount++;
    } else if (entry.type === "add") {
      hunkNewCount++;
    } else if (entry.type === "del") {
      hunkOldCount++;
    }
    // "no-newline" lines are passed through without counting
  }

  flushHunk();

  const diffStr = output.join("\n");

  // Compute display line positions for fold markers from the final diff string
  // (same input the <diff> element receives, ensuring perfect consistency)
  const markerLines = computeMarkerDisplayLines(diffStr, markerFoldIds);

  return { diff: diffStr, folds, markerLines };
}

// ── Internal types ──

interface Entry {
  raw: string;
  type: "hunk" | "ctx" | "add" | "del" | "no-newline";
  oldNum: number;
  newNum: number;
}

interface FoldableZone {
  startIdx: number;
  endIdx: number; // inclusive, index into entries[]
  length: number;
  foldId: number;
}

// ── Parsing ──

function parseEntries(lines: string[], headerEnd: number): Entry[] {
  const entries: Entry[] = [];
  let curOld = 0;
  let curNew = 0;

  for (let i = headerEnd; i < lines.length; i++) {
    const line = lines[i]!;
    const hm = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hm) {
      curOld = Number.parseInt(hm[1]!, 10);
      curNew = Number.parseInt(hm[2]!, 10);
      entries.push({ raw: line, type: "hunk", oldNum: curOld, newNum: curNew });
      continue;
    }

    if (line.length === 0 && i === lines.length - 1) continue; // trailing empty

    const ch = line[0];
    if (ch === " ") {
      entries.push({ raw: line, type: "ctx", oldNum: curOld, newNum: curNew });
      curOld++;
      curNew++;
    } else if (ch === "+") {
      entries.push({ raw: line, type: "add", oldNum: curOld, newNum: curNew });
      curNew++;
    } else if (ch === "-") {
      entries.push({ raw: line, type: "del", oldNum: curOld, newNum: curNew });
      curOld++;
    } else if (ch === "\\") {
      entries.push({
        raw: line,
        type: "no-newline",
        oldNum: curOld,
        newNum: curNew,
      });
    }
  }

  return entries;
}

function findFoldableZones(entries: Entry[]): FoldableZone[] {
  const zones: FoldableZone[] = [];
  let foldId = 0;
  let zoneStart = -1;

  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.type === "ctx") {
      if (zoneStart === -1) zoneStart = i;
    } else {
      if (zoneStart !== -1) {
        const length = i - zoneStart;
        if (length >= MIN_FOLDABLE) {
          zones.push({
            startIdx: zoneStart,
            endIdx: i - 1,
            length,
            foldId: foldId++,
          });
        }
        zoneStart = -1;
      }
    }
  }
  if (zoneStart !== -1) {
    const length = entries.length - zoneStart;
    if (length >= MIN_FOLDABLE) {
      zones.push({
        startIdx: zoneStart,
        endIdx: entries.length - 1,
        length,
        foldId: foldId++,
      });
    }
  }

  return zones;
}

// ── Marker helpers ──

const FILL = "\u2500"; // ─

/** Build a centered fold marker context line padded with ─ to `width`. */
function buildMarkerText(remaining: number, width: number): string {
  const core = `${remaining}${FOLD_MARKER_PATTERN}`;
  // -1 for the leading space (context-line prefix)
  const inner = Math.max(core.length, width - 1);
  const pad = inner - core.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ` ${FILL.repeat(left)} ${core}${FILL.repeat(right)}`;
}

/**
 * Compute 1-indexed display line positions for fold markers by scanning
 * the final diff string — the same input the `<diff>` element receives.
 * `markerFoldIds` lists fold IDs in the order markers appear in the diff.
 */
function computeMarkerDisplayLines(
  diffStr: string,
  markerFoldIds: number[],
): Map<number, number> {
  const result = new Map<number, number>();
  let markerIdx = 0;
  let displayLine = 0;
  let inHunk = false;

  for (const line of diffStr.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk || line.length === 0) continue;
    const ch = line[0];
    if (ch === "+" || ch === "-" || ch === " ") {
      displayLine++;
      if (
        line.includes(FOLD_MARKER_PATTERN) &&
        markerIdx < markerFoldIds.length
      ) {
        result.set(displayLine, markerFoldIds[markerIdx]!);
        markerIdx++;
      }
    } else if (ch === "\\") {
      // skip no-newline markers
    } else {
      inHunk = false;
    }
  }

  return result;
}
