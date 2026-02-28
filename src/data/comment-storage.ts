import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ReviewComment } from "../types.ts";

export interface StorageKey {
  repoHash: string;
  diffRange: string;
}

interface StorageData {
  comments: ReviewComment[];
  viewedFiles: string[];
  updatedAt: string;
}

function getStorageDir(): string {
  return join(homedir(), ".local", "share", "crev");
}

function getStoragePath(key: StorageKey): string {
  const dir = join(getStorageDir(), key.repoHash);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  // Sanitize diffRange for filename
  const safeName = key.diffRange.replace(/[/\\:]/g, "_");
  return join(dir, `${safeName}.json`);
}

export function makeStorageKey(
  repoRoot: string,
  diffRange: string,
): StorageKey {
  const hash = createHash("sha256").update(repoRoot).digest("hex").slice(0, 12);
  return { repoHash: hash, diffRange };
}

export function loadComments(key: StorageKey): ReviewComment[] {
  const path = getStoragePath(key);
  if (!existsSync(path)) return [];

  try {
    const raw = readFileSync(path, "utf-8");
    const data: StorageData = JSON.parse(raw);
    return data.comments ?? [];
  } catch {
    return [];
  }
}

export function saveComments(key: StorageKey, comments: ReviewComment[]) {
  const path = getStoragePath(key);
  const data: StorageData = {
    comments,
    viewedFiles: [],
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function loadViewedFiles(key: StorageKey): Set<string> {
  const path = getStoragePath(key);
  if (!existsSync(path)) return new Set();

  try {
    const raw = readFileSync(path, "utf-8");
    const data: StorageData = JSON.parse(raw);
    return new Set(data.viewedFiles ?? []);
  } catch {
    return new Set();
  }
}

export function saveViewedFiles(key: StorageKey, viewed: Set<string>) {
  const path = getStoragePath(key);
  let data: StorageData;

  try {
    const raw = readFileSync(path, "utf-8");
    data = JSON.parse(raw);
  } catch {
    data = {
      comments: [],
      viewedFiles: [],
      updatedAt: new Date().toISOString(),
    };
  }

  data.viewedFiles = [...viewed];
  data.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(data, null, 2));
}
