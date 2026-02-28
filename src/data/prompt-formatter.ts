import type { ReviewComment } from "../types.ts";
import { getLineFromDiff } from "./diff-parser.ts";

interface FormatOptions {
  rawDiffs: Map<string, string>; // filePath → rawDiff
}

export function formatPrompt(
  comments: ReviewComment[],
  options: FormatOptions,
): string {
  if (comments.length === 0) return "";

  const lines: string[] = ["以下のレビューコメントに対応してください:", ""];

  // Group by file
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    if (c.resolved) continue;
    const group = byFile.get(c.filePath) ?? [];
    group.push(c);
    byFile.set(c.filePath, group);
  }

  let first = true;
  for (const [filePath, fileComments] of byFile) {
    for (const comment of fileComments) {
      if (!first) lines.push("=====");
      first = false;

      const lineStr =
        typeof comment.position.line === "number"
          ? `L${comment.position.line}`
          : `L${comment.position.line.start}-L${comment.position.line.end}`;

      lines.push(`${filePath}:${lineStr}`);

      // Code snapshot
      if (comment.codeSnapshot?.content) {
        for (const codeLine of comment.codeSnapshot.content.split("\n")) {
          lines.push(`> ${codeLine}`);
        }
      } else {
        // Try to extract from raw diff
        const rawDiff = options.rawDiffs.get(filePath);
        if (rawDiff && typeof comment.position.line === "number") {
          const codeLine = getLineFromDiff(
            rawDiff,
            comment.position.line,
            comment.position.side,
          );
          if (codeLine) {
            lines.push(`> ${codeLine}`);
          }
        }
      }

      // Check for suggestion block (ORIGINAL/SUGGESTED pattern)
      if (comment.body.includes("SUGGESTED:")) {
        lines.push(comment.body);
      } else {
        lines.push(comment.body);
      }
    }
  }

  return lines.join("\n");
}

export function formatSingleComment(
  comment: ReviewComment,
  rawDiff?: string,
): string {
  const lineStr =
    typeof comment.position.line === "number"
      ? `L${comment.position.line}`
      : `L${comment.position.line.start}-L${comment.position.line.end}`;

  const lines: string[] = [`${comment.filePath}:${lineStr}`];

  if (comment.codeSnapshot?.content) {
    for (const codeLine of comment.codeSnapshot.content.split("\n")) {
      lines.push(`> ${codeLine}`);
    }
  } else if (rawDiff && typeof comment.position.line === "number") {
    const codeLine = getLineFromDiff(
      rawDiff,
      comment.position.line,
      comment.position.side,
    );
    if (codeLine) lines.push(`> ${codeLine}`);
  }

  lines.push(comment.body);
  return lines.join("\n");
}
