import type { TreeSitterClient } from "@opentui/core";
import type { SimpleHighlight } from "@opentui/core/lib/tree-sitter/types";
import { FOLD_MARKER_PATTERN } from "../data/diff-collapse.ts";

type DiffEntryKind = "ctx" | "add" | "del";
type UnifiedSide = "old" | "new";
type SplitSide = "left" | "right";

interface DiffEntry {
  kind: DiffEntryKind;
  content: string;
  oldLine: number;
  newLine: number;
  isFoldMarker: boolean;
}

interface HighlightLine {
  content: string;
  key: string | null;
}

function blankOfSameWidth(text: string): string {
  return " ".repeat(text.length);
}

function joinLineContents(lines: HighlightLine[]): string {
  return lines.map((line) => line.content).join("\n");
}

function keyForEntry(entry: DiffEntry): string {
  if (entry.kind === "ctx") {
    return `ctx:${entry.oldLine}:${entry.newLine}`;
  }
  if (entry.kind === "add") {
    return `add:${entry.newLine}`;
  }
  return `del:${entry.oldLine}`;
}

function parseDiffEntries(rawDiff: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const lines = rawDiff.split("\n");
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1]!, 10);
      newLine = Number.parseInt(hunkMatch[2]!, 10);
      inHunk = true;
      continue;
    }

    if (!inHunk || line.length === 0) continue;

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === " ") {
      entries.push({
        kind: "ctx",
        content,
        oldLine,
        newLine,
        isFoldMarker: content.includes(FOLD_MARKER_PATTERN),
      });
      oldLine++;
      newLine++;
      continue;
    }

    if (prefix === "+") {
      entries.push({
        kind: "add",
        content,
        oldLine,
        newLine,
        isFoldMarker: false,
      });
      newLine++;
      continue;
    }

    if (prefix === "-") {
      entries.push({
        kind: "del",
        content,
        oldLine,
        newLine,
        isFoldMarker: false,
      });
      oldLine++;
      continue;
    }

    if (prefix !== "\\") {
      inHunk = false;
    }
  }

  return entries;
}

function buildUnifiedSideLines(
  rawDiff: string,
  side: UnifiedSide,
): HighlightLine[] {
  return parseDiffEntries(rawDiff).map((entry) => {
    const key = entry.isFoldMarker ? null : keyForEntry(entry);
    if (entry.isFoldMarker) {
      return { content: blankOfSameWidth(entry.content), key };
    }

    if (side === "old" && entry.kind === "add") {
      return { content: blankOfSameWidth(entry.content), key };
    }

    if (side === "new" && entry.kind === "del") {
      return { content: blankOfSameWidth(entry.content), key };
    }

    return { content: entry.content, key };
  });
}

function buildSplitSideLineSets(rawDiff: string): {
  left: HighlightLine[];
  right: HighlightLine[];
} {
  const left: HighlightLine[] = [];
  const right: HighlightLine[] = [];
  const lines = rawDiff.split("\n");
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx] ?? "";
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1]!, 10);
      newLine = Number.parseInt(hunkMatch[2]!, 10);
      inHunk = true;
      idx++;
      continue;
    }

    if (!inHunk || line.length === 0) {
      idx++;
      continue;
    }

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === " ") {
      const isFoldMarker = content.includes(FOLD_MARKER_PATTERN);
      const visibleContent = isFoldMarker ? blankOfSameWidth(content) : content;
      const key = isFoldMarker ? null : `ctx:${oldLine}:${newLine}`;
      left.push({ content: visibleContent, key });
      right.push({ content: visibleContent, key });
      oldLine++;
      newLine++;
      idx++;
      continue;
    }

    if (prefix === "\\") {
      idx++;
      continue;
    }

    const removes: HighlightLine[] = [];
    const adds: HighlightLine[] = [];

    while (idx < lines.length) {
      const currentLine = lines[idx] ?? "";
      if (currentLine.length === 0) break;
      const currentPrefix = currentLine[0];
      if (currentPrefix !== "-" && currentPrefix !== "+") break;

      const currentContent = currentLine.slice(1);
      if (currentPrefix === "-") {
        removes.push({
          content: currentContent,
          key: `del:${oldLine}`,
        });
        oldLine++;
      } else {
        adds.push({
          content: currentContent,
          key: `add:${newLine}`,
        });
        newLine++;
      }
      idx++;
    }

    const maxLength = Math.max(removes.length, adds.length);
    for (let pairIdx = 0; pairIdx < maxLength; pairIdx++) {
      left.push(removes[pairIdx] ?? { content: "", key: null });
      right.push(adds[pairIdx] ?? { content: "", key: null });
    }
  }

  return { left, right };
}

function lineStartOffsets(lines: HighlightLine[]): number[] {
  const starts: number[] = [];
  let offset = 0;

  for (const line of lines) {
    starts.push(offset);
    offset += line.content.length + 1;
  }

  return starts;
}

function dedupeHighlights(highlights: SimpleHighlight[]): SimpleHighlight[] {
  const seen = new Set<string>();
  const deduped: SimpleHighlight[] = [];

  for (const highlight of highlights) {
    const [start, end, group, meta] = highlight;
    const key = `${start}:${end}:${group}:${JSON.stringify(meta ?? null)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(highlight);
  }

  deduped.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return deduped;
}

function projectHighlights(
  fullLines: HighlightLine[],
  visibleLines: HighlightLine[],
  highlights: SimpleHighlight[],
): SimpleHighlight[] {
  const fullIndexByKey = new Map<string, number>();
  for (let idx = 0; idx < fullLines.length; idx++) {
    const key = fullLines[idx]?.key;
    if (key) fullIndexByKey.set(key, idx);
  }

  const fullToVisible = new Map<number, number>();
  for (let idx = 0; idx < visibleLines.length; idx++) {
    const key = visibleLines[idx]?.key;
    if (!key) continue;
    const fullIdx = fullIndexByKey.get(key);
    if (fullIdx !== undefined) fullToVisible.set(fullIdx, idx);
  }

  const fullStarts = lineStartOffsets(fullLines);
  const visibleStarts = lineStartOffsets(visibleLines);
  const projected: SimpleHighlight[] = [];

  for (const highlight of highlights) {
    const [start, end, group, meta] = highlight;
    for (const [fullIdx, visibleIdx] of fullToVisible) {
      const fullLine = fullLines[fullIdx]!;
      const fullStart = fullStarts[fullIdx]!;
      const fullEnd = fullStart + fullLine.content.length;
      const overlapStart = Math.max(start, fullStart);
      const overlapEnd = Math.min(end, fullEnd);
      if (overlapStart >= overlapEnd) continue;

      const visibleStart = visibleStarts[visibleIdx]!;
      projected.push([
        visibleStart + (overlapStart - fullStart),
        visibleStart + (overlapEnd - fullStart),
        group,
        meta,
      ]);
    }
  }

  return dedupeHighlights(projected);
}

async function buildProjectedSideHighlights(
  fullLines: HighlightLine[],
  visibleLines: HighlightLine[],
  filetype: string,
  treeSitterClient: Pick<TreeSitterClient, "highlightOnce">,
): Promise<SimpleHighlight[]> {
  const fullContent = joinLineContents(fullLines);
  if (fullContent.length === 0) return [];

  const result = await treeSitterClient.highlightOnce(fullContent, filetype);
  return projectHighlights(fullLines, visibleLines, result.highlights ?? []);
}

export function buildUnifiedHighlightInputs(rawDiff: string): {
  oldContent: string;
  newContent: string;
} {
  const oldLines = buildUnifiedSideLines(rawDiff, "old");
  const newLines = buildUnifiedSideLines(rawDiff, "new");

  return {
    oldContent: joinLineContents(oldLines),
    newContent: joinLineContents(newLines),
  };
}

export function buildSplitHighlightInputs(rawDiff: string): {
  leftContent: string;
  rightContent: string;
} {
  const splitLines = buildSplitSideLineSets(rawDiff);
  return {
    leftContent: joinLineContents(splitLines.left),
    rightContent: joinLineContents(splitLines.right),
  };
}

export async function buildUnifiedProjectedHighlights(
  fullDiff: string,
  visibleDiff: string,
  filetype: string,
  treeSitterClient: Pick<TreeSitterClient, "highlightOnce">,
): Promise<SimpleHighlight[]> {
  const [fullOld, fullNew] = [
    buildUnifiedSideLines(fullDiff, "old"),
    buildUnifiedSideLines(fullDiff, "new"),
  ];
  const [visibleOld, visibleNew] = [
    buildUnifiedSideLines(visibleDiff, "old"),
    buildUnifiedSideLines(visibleDiff, "new"),
  ];
  const [oldHighlights, newHighlights] = await Promise.all([
    buildProjectedSideHighlights(
      fullOld,
      visibleOld,
      filetype,
      treeSitterClient,
    ),
    buildProjectedSideHighlights(
      fullNew,
      visibleNew,
      filetype,
      treeSitterClient,
    ),
  ]);

  return dedupeHighlights([...oldHighlights, ...newHighlights]);
}

export async function buildSplitProjectedHighlights(
  fullDiff: string,
  visibleDiff: string,
  filetype: string,
  side: SplitSide,
  treeSitterClient: Pick<TreeSitterClient, "highlightOnce">,
): Promise<SimpleHighlight[]> {
  const fullLines = buildSplitSideLineSets(fullDiff);
  const visibleLines = buildSplitSideLineSets(visibleDiff);

  return buildProjectedSideHighlights(
    fullLines[side],
    visibleLines[side],
    filetype,
    treeSitterClient,
  );
}
