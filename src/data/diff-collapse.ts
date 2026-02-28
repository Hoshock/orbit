/** Number of context lines to keep around changes. */
const CONTEXT_LINES = 3;
/** Minimum consecutive context lines to qualify for folding. */
const MIN_FOLDABLE = CONTEXT_LINES * 2 + 1;

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
}

/**
 * Collapse a full-context unified diff, hiding long unchanged sections.
 * Zones in `expanded` are kept fully visible.
 */
export function collapseDiff(
  fullDiff: string,
  expanded: Set<number>,
): CollapsedDiff {
  const lines = fullDiff.split("\n");

  // Find header end (before first @@)
  let headerEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith("@@")) {
      headerEnd = i;
      break;
    }
  }
  if (headerEnd < 0) {
    return { diff: fullDiff, folds: [] };
  }

  // Parse content lines with source line tracking
  const entries = parseEntries(lines, headerEnd);
  if (entries.length === 0) {
    return { diff: fullDiff, folds: [] };
  }

  // Find foldable context zones
  const zones = findFoldableZones(entries);
  if (zones.length === 0) {
    return { diff: fullDiff, folds: [] };
  }

  // Build FoldRegion array
  const folds: FoldRegion[] = zones.map((z) => ({
    id: z.foldId,
    hiddenCount: z.length - CONTEXT_LINES * 2,
    newLineStart: entries[z.startIdx]!.newNum,
    newLineEnd: entries[z.endIdx]!.newNum,
  }));

  // Mark which entries are visible
  const visible = new Array<boolean>(entries.length).fill(true);
  for (const zone of zones) {
    if (expanded.has(zone.foldId)) continue;
    const foldStart = zone.startIdx + CONTEXT_LINES;
    const foldEnd = zone.endIdx - CONTEXT_LINES;
    for (let i = foldStart; i <= foldEnd; i++) {
      visible[i] = false;
    }
  }

  // Group visible entries into hunks
  const header = lines.slice(0, headerEnd);
  const output: string[] = [...header];

  let inHunk = false;
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  let hunkOldCount = 0;
  let hunkNewCount = 0;
  let hunkLines: string[] = [];

  const flushHunk = (annotation: string | null) => {
    if (!inHunk || hunkLines.length === 0) return;
    const suffix = annotation ? ` ${annotation}` : "";
    output.push(
      `@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@${suffix}`,
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
      if (inHunk) {
        flushHunk(null);
      }
      continue;
    }

    // Visible entry
    if (!inHunk) {
      // Start a new hunk
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

  // Find fold annotations for hunks
  // We need a second pass: identify which hunk headers should carry fold annotations
  flushHunk(null);

  // Re-scan output to add fold annotations to the correct hunk headers
  // A hunk that follows a folded zone should carry the "⋯ N lines ⋯" annotation
  const finalOutput = addFoldAnnotations(
    output,
    header.length,
    zones,
    entries,
    expanded,
  );

  return { diff: finalOutput.join("\n"), folds };
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

// ── Fold annotations ──

function addFoldAnnotations(
  outputLines: string[],
  headerCount: number,
  zones: FoldableZone[],
  entries: Entry[],
  expanded: Set<number>,
): string[] {
  // For each folded zone, the hunk header that starts the "bottom context"
  // should carry the fold annotation. We identify these by matching the
  // newStart line number of the hunk header with the expected position
  // after the fold.
  const annotations = new Map<string, string>(); // hunk-header-key → annotation

  for (const zone of zones) {
    if (expanded.has(zone.foldId)) continue;
    const hiddenCount = zone.length - CONTEXT_LINES * 2;
    // The bottom context starts at entries[zone.endIdx - CONTEXT_LINES + 1]
    const bottomStart = entries[zone.endIdx - CONTEXT_LINES + 1];
    if (bottomStart) {
      const key = `${bottomStart.oldNum}:${bottomStart.newNum}`;
      annotations.set(
        key,
        `\u2500\u2500\u2500 ${hiddenCount} lines hidden \u2500 z to expand \u2500\u2500\u2500`,
      );
    }
  }

  if (annotations.size === 0) return outputLines;

  const result: string[] = [];
  for (const line of outputLines) {
    const hm = line.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@(.*)$/);
    if (hm) {
      const oldStart = hm[1]!;
      const newStart = hm[3]!;
      const key = `${oldStart}:${newStart}`;
      const annotation = annotations.get(key);
      if (annotation) {
        result.push(
          `@@ -${oldStart},${hm[2]} +${newStart},${hm[4]} @@ ${annotation}`,
        );
        annotations.delete(key);
        continue;
      }
    }
    result.push(line);
  }

  return result;
}
