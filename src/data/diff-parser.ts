import { GENERATED_PATTERNS } from "../constants.ts";
import type { CrevDiffFile } from "../types.ts";
import { runGit } from "../utils/git.ts";

export function parseDiffFiles(
  diffArgs: string[],
  repoRoot: string,
): CrevDiffFile[] {
  const raw = runGit([...diffArgs, "--no-color"], repoRoot);
  if (!raw.trim()) return [];

  // Also get --stat for +/- counts
  const stat = runGit([...diffArgs, "--stat", "--no-color"], repoRoot);
  const statMap = parseStatCounts(stat);

  return splitDiffIntoFiles(raw, statMap);
}

function splitDiffIntoFiles(
  raw: string,
  statMap: Map<string, { additions: number; deletions: number }>,
): CrevDiffFile[] {
  const files: CrevDiffFile[] = [];
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
): CrevDiffFile | null {
  // Extract file paths from diff --git header
  const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
  if (!headerMatch) return null;

  const oldPath = headerMatch[1]!;
  const newPath = headerMatch[2]!;

  // Determine status
  let status: CrevDiffFile["status"] = "modified";
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

function parseStatCounts(
  stat: string,
): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();

  for (const line of stat.split("\n")) {
    // Match lines like: " src/main.py | 42 +++---"
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)/);
    if (!match) continue;

    const filePath = match[1]?.trim();
    // Parse the +/- from numstat instead for accuracy
    const totalChanges = parseInt(match[2]!, 10);
    const signs = match[3] ?? "";
    const plusCount = (signs.match(/\+/g) || []).length;
    const minusCount = (signs.match(/-/g) || []).length;
    const total = plusCount + minusCount;

    if (total === 0) {
      map.set(filePath, { additions: totalChanges, deletions: 0 });
    } else {
      const ratio = totalChanges / total;
      map.set(filePath, {
        additions: Math.round(plusCount * ratio),
        deletions: Math.round(minusCount * ratio),
      });
    }
  }

  return map;
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
