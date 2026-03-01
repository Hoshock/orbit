import { basename } from "node:path";
import type { ReviewComment } from "../types.ts";

function cachePrefix(repoRoot: string, base: string, target: string): string {
  const repo = basename(repoRoot);
  const key = `${base}..${target}`;
  const hash = Bun.hash(key).toString(16).slice(0, 12);
  return `/tmp/orbit-${repo}-${hash}`;
}

export function getCachePath(
  repoRoot: string,
  base: string,
  target: string,
): string {
  return `${cachePrefix(repoRoot, base, target)}.json`;
}

export function getPrefsCachePath(
  repoRoot: string,
  base: string,
  target: string,
): string {
  return `${cachePrefix(repoRoot, base, target)}-prefs.json`;
}

export function loadPrefs(cachePath: string): Record<string, unknown> {
  try {
    const file = Bun.file(cachePath);
    if (file.size === 0) return {};
    const text = require("node:fs").readFileSync(cachePath, "utf-8");
    const data = JSON.parse(text);
    if (typeof data !== "object" || data === null || Array.isArray(data))
      return {};
    return data as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function savePrefs(
  cachePath: string,
  prefs: Record<string, unknown>,
): void {
  try {
    require("node:fs").writeFileSync(cachePath, JSON.stringify(prefs));
  } catch {
    // Silently fail — cache is best-effort
  }
}

export function getViewedCachePath(
  repoRoot: string,
  base: string,
  target: string,
): string {
  return `${cachePrefix(repoRoot, base, target)}-viewed.json`;
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

export function loadViewedFiles(cachePath: string): Set<string> {
  try {
    const file = Bun.file(cachePath);
    if (file.size === 0) return new Set();
    const text = require("node:fs").readFileSync(cachePath, "utf-8");
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return new Set();
    return new Set(data);
  } catch {
    return new Set();
  }
}

export function saveViewedFiles(cachePath: string, viewed: Set<string>): void {
  try {
    require("node:fs").writeFileSync(
      cachePath,
      JSON.stringify([...viewed], null, 2),
    );
  } catch {
    // Silently fail — cache is best-effort
  }
}
