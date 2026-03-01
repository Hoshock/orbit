import { GENERATED_PATTERNS } from "../constants.ts";
import type { DiffFile } from "../types.ts";
import { runGit } from "../utils/git.ts";

export function parseDiffFiles(
  diffArgs: string[],
  repoRoot: string,
): DiffFile[] {
  // Generate full-context diff for fold/unfold support
  const fullArgs = injectFullContext(diffArgs);
  const raw = runGit([...fullArgs, "--no-color"], repoRoot);
  if (!raw.trim()) return [];

  // Get --numstat for accurate +/- counts
  const numstat = runGit([...diffArgs, "--numstat"], repoRoot);
  const statMap = parseNumstat(numstat);

  return splitDiffIntoFiles(raw, statMap);
}

function injectFullContext(args: string[]): string[] {
  const result = [...args];
  const idx = result.indexOf("diff");
  if (idx >= 0) result.splice(idx + 1, 0, "-U99999");
  return result;
}

function splitDiffIntoFiles(
  raw: string,
  statMap: Map<string, { additions: number; deletions: number }>,
): DiffFile[] {
  const files: DiffFile[] = [];
  const fileDiffs = raw.split(/^(?=diff --git )/m);

  for (const chunk of fileDiffs) {
    if (!chunk.trim()) continue;

    const file = parseFileDiff(chunk, statMap);
    if (file) files.push(file);
  }

  return files;
}

function parseFileDiff(
  chunk: string,
  statMap: Map<string, { additions: number; deletions: number }>,
): DiffFile | null {
  // Extract file paths from diff --git header
  const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
  if (!headerMatch) return null;

  const oldPath = headerMatch[1]!;
  const newPath = headerMatch[2]!;

  // Determine status
  let status: DiffFile["status"] = "modified";
  if (chunk.includes("new file mode")) {
    status = "added";
  } else if (chunk.includes("deleted file mode")) {
    status = "deleted";
  } else if (chunk.includes("rename from") || oldPath !== newPath) {
    status = "renamed";
  }

  const path = newPath;
  const stats = statMap.get(path) ??
    statMap.get(oldPath) ?? { additions: 0, deletions: 0 };

  const isGenerated = GENERATED_PATTERNS.some((p) => p.test(path));

  return {
    path,
    oldPath: oldPath !== newPath ? oldPath : undefined,
    status,
    additions: stats.additions,
    deletions: stats.deletions,
    rawDiff: chunk,
    isGenerated,
  };
}

export function parseNumstat(
  numstat: string,
): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();

  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    // Format: "42\t15\tpath" or "-\t-\tbinary" or "0\t0\t{old => new}"
    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const adds = parts[0] === "-" ? 0 : parseInt(parts[0]!, 10);
    const dels = parts[1] === "-" ? 0 : parseInt(parts[1]!, 10);
    // Handle rename: "{old_dir => new_dir}/file" or "old => new"
    let filePath = parts.slice(2).join("\t");
    const renameMatch = filePath.match(/\{(.+?) => (.+?)\}/);
    if (renameMatch) {
      filePath = filePath.replace(/\{.+? => (.+?)\}/, renameMatch[2]!);
    }

    if (filePath) {
      map.set(filePath, { additions: adds, deletions: dels });
    }
  }

  return map;
}

/** Count display lines the <diff> component renders (content lines only, no hunk headers or file headers). */
export function getDisplayLineCount(
  rawDiff: string,
  splitMode = false,
): number {
  if (!splitMode) {
    return countUnifiedLines(rawDiff);
  }
  return countSplitLines(rawDiff);
}

function countUnifiedLines(rawDiff: string): number {
  const lines = rawDiff.split("\n");
  let count = 0;
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && line.length > 0) {
      const ch = line[0];
      if (ch === "+" || ch === "-" || ch === " ") {
        count++;
      } else if (ch === "\\") {
        // skip
      } else {
        inHunk = false;
      }
    }
  }
  return Math.max(1, count);
}

/** Split view pairs removals and additions per change group; shorter side is padded. */
function countSplitLines(rawDiff: string): number {
  const lines = rawDiff.split("\n");
  let count = 0;
  let inHunk = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("@@")) {
      inHunk = true;
      i++;
      continue;
    }
    if (!inHunk || line.length === 0) {
      i++;
      continue;
    }
    const ch = line[0];
    if (ch === " ") {
      count++;
      i++;
    } else if (ch === "-" || ch === "+") {
      // Collect change group: consecutive "-" then consecutive "+"
      let removals = 0;
      let additions = 0;
      while (i < lines.length && lines[i]!.length > 0 && lines[i]![0] === "-") {
        removals++;
        i++;
      }
      while (i < lines.length && lines[i]!.length > 0 && lines[i]![0] === "+") {
        additions++;
        i++;
      }
      count += Math.max(removals, additions);
    } else if (ch === "\\") {
      i++;
    } else {
      inHunk = false;
      i++;
    }
  }
  return Math.max(1, count);
}

/** Get the diff line type at a 1-indexed display line position (content lines only, no hunk headers). */
export function getDiffLineType(
  rawDiff: string,
  displayLine: number,
): "+" | "-" | " " | null {
  const lines = rawDiff.split("\n");
  let count = 0;
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && line.length > 0) {
      const ch = line[0];
      if (ch === "+" || ch === "-" || ch === " ") {
        count++;
        if (count === displayLine) return ch as "+" | "-" | " ";
      } else if (ch === "\\") {
        // skip
      } else {
        inHunk = false;
      }
    }
  }
  return null;
}

/**
 * Returns true if the display line is a `-` line in a change group
 * that has NO corresponding `+` lines (pure deletion, not a modification).
 */
export function isPureDeletion(rawDiff: string, displayLine: number): boolean {
  const lines = rawDiff.split("\n");
  let count = 0;
  let inHunk = false;
  let targetRawIdx = -1;

  // Find the raw line index for this display line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && line.length > 0) {
      const ch = line[0];
      if (ch === "+" || ch === "-" || ch === " ") {
        count++;
        if (count === displayLine) {
          if (ch !== "-") return false;
          targetRawIdx = i;
          break;
        }
      } else if (ch === "\\") {
        // skip
      } else {
        inHunk = false;
      }
    }
  }

  if (targetRawIdx === -1) return false;

  // Find end of consecutive `-` lines in this change group
  let afterDeletions = targetRawIdx;
  while (
    afterDeletions < lines.length &&
    lines[afterDeletions]!.length > 0 &&
    lines[afterDeletions]![0] === "-"
  ) {
    afterDeletions++;
  }

  // Check if `+` lines follow (modification) or not (pure deletion)
  if (
    afterDeletions < lines.length &&
    lines[afterDeletions]!.length > 0 &&
    lines[afterDeletions]![0] === "+"
  ) {
    return false; // has additions → modification
  }

  return true; // no additions → pure deletion
}

/** Convert a 1-indexed display line to source line numbers. */
export function displayLineToSourceLine(
  rawDiff: string,
  displayLine: number,
): { oldLine: number | null; newLine: number | null } {
  const lines = rawDiff.split("\n");
  let oldLine = 0;
  let newLine = 0;
  let count = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10) - 1;
      newLine = parseInt(hunkMatch[2]!, 10) - 1;
      inHunk = true;
      continue;
    }

    if (!inHunk || line.length === 0) continue;

    const ch = line[0];
    if (ch === "+") {
      newLine++;
      count++;
      if (count === displayLine) return { oldLine: null, newLine };
    } else if (ch === "-") {
      oldLine++;
      count++;
      if (count === displayLine) return { oldLine, newLine: null };
    } else if (ch === " ") {
      oldLine++;
      newLine++;
      count++;
      if (count === displayLine) return { oldLine, newLine };
    } else if (ch === "\\") {
      // skip
    } else {
      inHunk = false;
    }
  }

  return { oldLine: null, newLine: null };
}

/** Convert a source line number back to 1-indexed display line. */
export function sourceLineToDisplayLine(
  rawDiff: string,
  sourceLine: number,
  side: "old" | "new",
): number | null {
  const lines = rawDiff.split("\n");
  let oldLine = 0;
  let newLine = 0;
  let count = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10) - 1;
      newLine = parseInt(hunkMatch[2]!, 10) - 1;
      inHunk = true;
      continue;
    }

    if (!inHunk || line.length === 0) continue;

    const ch = line[0];
    if (ch === "+") {
      newLine++;
      count++;
      if (side === "new" && newLine === sourceLine) return count;
    } else if (ch === "-") {
      oldLine++;
      count++;
      if (side === "old" && oldLine === sourceLine) return count;
    } else if (ch === " ") {
      oldLine++;
      newLine++;
      count++;
      if (side === "new" && newLine === sourceLine) return count;
      if (side === "old" && oldLine === sourceLine) return count;
    } else if (ch === "\\") {
      // skip
    } else {
      inHunk = false;
    }
  }

  return null;
}

/** Convert a display-line range to a source-line range on a consistent side. */
export function displayRangeToSourceRange(
  rawDiff: string,
  startDisplay: number,
  endDisplay: number,
): { start: number; end: number; side: "old" | "new" } {
  const newLines: number[] = [];
  const oldLines: number[] = [];

  for (let d = startDisplay; d <= endDisplay; d++) {
    const src = displayLineToSourceLine(rawDiff, d);
    if (src.newLine !== null) newLines.push(src.newLine);
    if (src.oldLine !== null) oldLines.push(src.oldLine);
  }

  if (newLines.length > 0) {
    return {
      start: Math.min(...newLines),
      end: Math.max(...newLines),
      side: "new",
    };
  }
  if (oldLines.length > 0) {
    return {
      start: Math.min(...oldLines),
      end: Math.max(...oldLines),
      side: "old",
    };
  }

  return { start: startDisplay, end: endDisplay, side: "new" };
}

// ── Split-mode variants ──
// In split mode, change groups (consecutive - then +) are paired row by row.
// E.g. 2 removals + 3 additions = 3 split rows (shorter side padded with null).

/** Convert a 1-indexed split display row to source line numbers. */
export function displayLineToSourceLineSplit(
  rawDiff: string,
  displayLine: number,
): { oldLine: number | null; newLine: number | null } {
  const lines = rawDiff.split("\n");
  let oldLine = 0;
  let newLine = 0;
  let count = 0;
  let inHunk = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10) - 1;
      newLine = parseInt(hunkMatch[2]!, 10) - 1;
      inHunk = true;
      i++;
      continue;
    }
    if (!inHunk || line.length === 0) {
      i++;
      continue;
    }
    const ch = line[0];
    if (ch === " ") {
      oldLine++;
      newLine++;
      count++;
      if (count === displayLine) return { oldLine, newLine };
      i++;
    } else if (ch === "-" || ch === "+") {
      const olds: number[] = [];
      const news: number[] = [];
      while (i < lines.length && lines[i]!.length > 0 && lines[i]![0] === "-") {
        oldLine++;
        olds.push(oldLine);
        i++;
      }
      while (i < lines.length && lines[i]!.length > 0 && lines[i]![0] === "+") {
        newLine++;
        news.push(newLine);
        i++;
      }
      const rows = Math.max(olds.length, news.length);
      for (let r = 0; r < rows; r++) {
        count++;
        if (count === displayLine) {
          return {
            oldLine: r < olds.length ? olds[r]! : null,
            newLine: r < news.length ? news[r]! : null,
          };
        }
      }
    } else if (ch === "\\") {
      i++;
    } else {
      inHunk = false;
      i++;
    }
  }
  return { oldLine: null, newLine: null };
}

/** Convert a source line number to 1-indexed split display row. */
export function sourceLineToDisplayLineSplit(
  rawDiff: string,
  sourceLine: number,
  side: "old" | "new",
): number | null {
  const lines = rawDiff.split("\n");
  let oldLine = 0;
  let newLine = 0;
  let count = 0;
  let inHunk = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10) - 1;
      newLine = parseInt(hunkMatch[2]!, 10) - 1;
      inHunk = true;
      i++;
      continue;
    }
    if (!inHunk || line.length === 0) {
      i++;
      continue;
    }
    const ch = line[0];
    if (ch === " ") {
      oldLine++;
      newLine++;
      count++;
      if (side === "new" && newLine === sourceLine) return count;
      if (side === "old" && oldLine === sourceLine) return count;
      i++;
    } else if (ch === "-" || ch === "+") {
      const olds: number[] = [];
      const news: number[] = [];
      while (i < lines.length && lines[i]!.length > 0 && lines[i]![0] === "-") {
        oldLine++;
        olds.push(oldLine);
        i++;
      }
      while (i < lines.length && lines[i]!.length > 0 && lines[i]![0] === "+") {
        newLine++;
        news.push(newLine);
        i++;
      }
      const rows = Math.max(olds.length, news.length);
      for (let r = 0; r < rows; r++) {
        count++;
        if (side === "old" && r < olds.length && olds[r] === sourceLine)
          return count;
        if (side === "new" && r < news.length && news[r] === sourceLine)
          return count;
      }
    } else if (ch === "\\") {
      i++;
    } else {
      inHunk = false;
      i++;
    }
  }
  return null;
}

/**
 * Convert unified-view marker display lines to split-view display lines.
 * Fold markers are context lines, so they can be remapped via source lines.
 */
export function markerLinesUnifiedToSplit(
  rawDiff: string,
  markerLines: Map<number, number>,
): Map<number, number> {
  const splitMarkerLines = new Map<number, number>();

  for (const [unifiedDisplayLine, foldId] of markerLines) {
    const src = displayLineToSourceLine(rawDiff, unifiedDisplayLine);
    const splitDisplayLine =
      (src.newLine !== null
        ? sourceLineToDisplayLineSplit(rawDiff, src.newLine, "new")
        : null) ??
      (src.oldLine !== null
        ? sourceLineToDisplayLineSplit(rawDiff, src.oldLine, "old")
        : null);

    if (splitDisplayLine !== null) {
      splitMarkerLines.set(splitDisplayLine, foldId);
    }
  }

  return splitMarkerLines;
}

/** Convert a split display range to source range for a specific side. */
export function displayRangeToSourceRangeSplit(
  rawDiff: string,
  startDisplay: number,
  endDisplay: number,
  side: "old" | "new",
): { start: number; end: number; side: "old" | "new" } | null {
  const sourceLines: number[] = [];
  for (let d = startDisplay; d <= endDisplay; d++) {
    const src = displayLineToSourceLineSplit(rawDiff, d);
    const line = side === "new" ? src.newLine : src.oldLine;
    if (line !== null) sourceLines.push(line);
  }
  if (sourceLines.length === 0) return null;
  return {
    start: Math.min(...sourceLines),
    end: Math.max(...sourceLines),
    side,
  };
}

export function getLineFromDiff(
  rawDiff: string,
  lineNum: number,
  side: "old" | "new",
): string | null {
  const lines = rawDiff.split("\n");
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10) - 1;
      newLine = parseInt(hunkMatch[2]!, 10) - 1;
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("+")) {
      newLine++;
      if (side === "new" && newLine === lineNum) {
        return line;
      }
    } else if (line.startsWith("-")) {
      oldLine++;
      if (side === "old" && oldLine === lineNum) {
        return line;
      }
    } else if (!line.startsWith("\\")) {
      oldLine++;
      newLine++;
      if (side === "new" && newLine === lineNum) return ` ${line.slice(1)}`;
      if (side === "old" && oldLine === lineNum) return ` ${line.slice(1)}`;
    }
  }

  return null;
}
