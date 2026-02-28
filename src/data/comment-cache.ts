import { basename } from "node:path";
import type { ReviewComment } from "../types.ts";

export function getCachePath(
  repoRoot: string,
  base: string,
  target: string,
): string {
  const repo = basename(repoRoot);
  const key = `${base}..${target}`;
  const hash = Bun.hash(key).toString(16).slice(0, 12);
  return `/tmp/orbit-${repo}-${hash}.json`;
}

export function loadComments(cachePath: string): ReviewComment[] {
  try {
    const file = Bun.file(cachePath);
    if (file.size === 0) return [];
    // Synchronous read via JSON parse of the file
    const text = require("node:fs").readFileSync(cachePath, "utf-8");
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export function saveComments(
  cachePath: string,
  comments: ReviewComment[],
): void {
  try {
    require("node:fs").writeFileSync(
      cachePath,
      JSON.stringify(comments, null, 2),
    );
  } catch {
    // Silently fail — cache is best-effort
  }
}
