import type { ReviewComment } from "../types.ts";

interface PromptOptions {
  oldHash?: string;
  newHash?: string;
}

function formatLocation(comment: ReviewComment, opts: PromptOptions): string {
  const pos = comment.position;
  const lineStr =
    typeof pos.line === "number"
      ? pos.line === 0
        ? ""
        : `:L${pos.line}`
      : `:L${pos.line.start}-L${pos.line.end}`;
  if (!lineStr) return comment.filePath;
  const label =
    pos.side === "old" ? opts.oldHash || "old" : opts.newHash || "new";
  return `${comment.filePath}${lineStr} (${label})`;
}

export function formatPrompt(
  comments: ReviewComment[],
  opts: PromptOptions = {},
): string {
  if (comments.length === 0) return "";

  const active = comments.filter((c) => !c.resolved);
  if (active.length === 0) return "";

  const lines: string[] = [];

  let first = true;
  for (const comment of active) {
    if (!first) lines.push("==========");
    first = false;

    lines.push(formatLocation(comment, opts));
    lines.push(comment.body);
  }

  return lines.join("\n");
}
