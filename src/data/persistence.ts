import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type {
  OrbitConfig,
  OrbitInitialView,
  OrbitKeybindings,
  ReviewComment,
} from "../types.ts";

interface SessionPersistenceData {
  comments?: ReviewComment[];
  viewedFiles?: string[];
  prefs?: Record<string, unknown>;
}

export interface SessionPersistenceState {
  comments: ReviewComment[];
  viewedFiles: Set<string>;
  prefs: Record<string, unknown>;
}

export const DEFAULT_ORBIT_KEYBINDINGS: OrbitKeybindings = {
  fileTree: {
    quit: "q",
    commentList: "c",
    promptPreview: "p",
    toggleViewMode: "t",
    toggleViewed: "v",
    treeShrink: "[",
    treeGrow: "]",
  },
  diffView: {
    quit: "q",
    comment: "c",
    deleteComment: "d",
    editComment: "e",
    fileComment: "f",
    toggleViewMode: "t",
    toggleViewed: "v",
    fold: "z",
  },
  commentList: {
    quit: "q",
    deleteComment: "d",
    editComment: "e",
  },
  promptPreview: {
    quit: "q",
    copyPrompt: "y",
  },
};

export const DEFAULT_ORBIT_CONFIG: OrbitConfig = {
  fileTreeInitialWidth: 0.2,
  initialView: "unified",
  keybindings: DEFAULT_ORBIT_KEYBINDINGS,
};

function cachePrefix(repoRoot: string, base: string, target: string): string {
  const repo = basename(repoRoot);
  const key = `${base}..${target}`;
  const hash = Bun.hash(key).toString(16).slice(0, 12);
  return `/tmp/orbit-${repo}-${hash}`;
}

export function getSessionCachePath(
  repoRoot: string,
  base: string,
  target: string,
): string {
  return `${cachePrefix(repoRoot, base, target)}.json`;
}

function parseSessionData(raw: string): SessionPersistenceData {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as SessionPersistenceData;
}

function readSessionData(cachePath: string): SessionPersistenceData {
  try {
    const file = Bun.file(cachePath);
    if (file.size === 0) return {};
    return parseSessionData(readFileSync(cachePath, "utf-8"));
  } catch {
    return {};
  }
}

function writeSessionData(
  cachePath: string,
  data: SessionPersistenceData,
): void {
  try {
    writeFileSync(cachePath, JSON.stringify(data, null, 2));
  } catch {
    // Silently fail — cache is best-effort
  }
}

export function loadSessionState(cachePath: string): SessionPersistenceState {
  const data = readSessionData(cachePath);
  const comments = Array.isArray(data.comments) ? data.comments : [];
  const viewedFiles = Array.isArray(data.viewedFiles) ? data.viewedFiles : [];
  const prefs =
    data.prefs &&
    typeof data.prefs === "object" &&
    !Array.isArray(data.prefs) &&
    data.prefs !== null
      ? data.prefs
      : {};

  return {
    comments,
    viewedFiles: new Set(viewedFiles),
    prefs: prefs as Record<string, unknown>,
  };
}

export function saveSessionComments(
  cachePath: string,
  comments: ReviewComment[],
): void {
  const data = readSessionData(cachePath);
  data.comments = [...comments];
  writeSessionData(cachePath, data);
}

export function saveSessionViewedFiles(
  cachePath: string,
  viewed: Set<string>,
): void {
  const data = readSessionData(cachePath);
  data.viewedFiles = [...viewed];
  writeSessionData(cachePath, data);
}

export function saveSessionPrefs(
  cachePath: string,
  prefs: Record<string, unknown>,
): void {
  const data = readSessionData(cachePath);
  const existing =
    data.prefs &&
    typeof data.prefs === "object" &&
    !Array.isArray(data.prefs) &&
    data.prefs !== null
      ? data.prefs
      : {};
  data.prefs = { ...(existing as Record<string, unknown>), ...prefs };
  writeSessionData(cachePath, data);
}

function normalizeInitialView(value: unknown): OrbitInitialView {
  return value === "split" ? "split" : "unified";
}

function normalizeTreeWidth(value: unknown): number {
  if (typeof value !== "number")
    return DEFAULT_ORBIT_CONFIG.fileTreeInitialWidth;
  if (!Number.isFinite(value)) return DEFAULT_ORBIT_CONFIG.fileTreeInitialWidth;
  if (value < 0.1 || value > 0.5)
    return DEFAULT_ORBIT_CONFIG.fileTreeInitialWidth;
  return value;
}

function normalizeKeybinding(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
}

function toConfigObject(parsed: unknown): Record<string, unknown> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function pickNestedTable(
  parent: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> {
  for (const key of keys) {
    const value = parent[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

function pickValue(table: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (table[key] !== undefined) return table[key];
  }
  return undefined;
}

export function getOrbitConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const home = env.HOME ?? process.cwd();
  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim();
  const baseConfigDir =
    xdgConfigHome && xdgConfigHome.length > 0
      ? expandHomePrefix(xdgConfigHome, home)
      : join(home, ".config");
  return join(baseConfigDir, "orbit", "config.toml");
}

function expandHomePrefix(value: string, home: string): string {
  if (value === "~") return home;
  if (value.startsWith("~/")) return join(home, value.slice(2));
  return value;
}

export function loadOrbitConfig(
  configPath = getOrbitConfigPath(),
): OrbitConfig {
  try {
    const file = Bun.file(configPath);
    if (file.size === 0) return DEFAULT_ORBIT_CONFIG;

    const text = readFileSync(configPath, "utf-8");
    const parsed = Bun.TOML.parse(text);
    const conf = toConfigObject(parsed);
    const keybindingsRoot = toConfigObject(conf.keybindings);

    // Format: [keybindings.file-tree], [keybindings.diff-view], ...
    const fileTree = pickNestedTable(
      keybindingsRoot,
      "file-tree",
      "file_tree",
      "fileTree",
    );
    const diffView = pickNestedTable(
      keybindingsRoot,
      "diff-view",
      "diff_view",
      "diffView",
    );
    const commentList = pickNestedTable(
      keybindingsRoot,
      "comment-list",
      "comment_list",
      "commentList",
    );
    const promptPreview = pickNestedTable(
      keybindingsRoot,
      "prompt-preview",
      "prompt_preview",
      "promptPreview",
    );

    return {
      fileTreeInitialWidth: normalizeTreeWidth(conf.file_tree_initial_width),
      initialView: normalizeInitialView(conf.initial_view),
      keybindings: {
        fileTree: {
          quit: normalizeKeybinding(
            pickValue(fileTree, ["quit"]),
            DEFAULT_ORBIT_KEYBINDINGS.fileTree.quit,
          ),
          commentList: normalizeKeybinding(
            pickValue(fileTree, ["comment_list", "commentList"]),
            DEFAULT_ORBIT_KEYBINDINGS.fileTree.commentList,
          ),
          promptPreview: normalizeKeybinding(
            pickValue(fileTree, ["prompt_preview", "promptPreview"]),
            DEFAULT_ORBIT_KEYBINDINGS.fileTree.promptPreview,
          ),
          toggleViewMode: normalizeKeybinding(
            pickValue(fileTree, ["toggle_view_mode", "toggleViewMode"]),
            DEFAULT_ORBIT_KEYBINDINGS.fileTree.toggleViewMode,
          ),
          toggleViewed: normalizeKeybinding(
            pickValue(fileTree, ["toggle_viewed", "toggleViewed"]),
            DEFAULT_ORBIT_KEYBINDINGS.fileTree.toggleViewed,
          ),
          treeShrink: normalizeKeybinding(
            pickValue(fileTree, ["tree_shrink", "treeShrink"]),
            DEFAULT_ORBIT_KEYBINDINGS.fileTree.treeShrink,
          ),
          treeGrow: normalizeKeybinding(
            pickValue(fileTree, ["tree_grow", "treeGrow"]),
            DEFAULT_ORBIT_KEYBINDINGS.fileTree.treeGrow,
          ),
        },
        diffView: {
          quit: normalizeKeybinding(
            pickValue(diffView, ["quit"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.quit,
          ),
          comment: normalizeKeybinding(
            pickValue(diffView, ["comment"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.comment,
          ),
          deleteComment: normalizeKeybinding(
            pickValue(diffView, ["delete_comment", "deleteComment"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.deleteComment,
          ),
          editComment: normalizeKeybinding(
            pickValue(diffView, ["edit_comment", "editComment"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.editComment,
          ),
          fileComment: normalizeKeybinding(
            pickValue(diffView, ["file_comment", "fileComment"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.fileComment,
          ),
          toggleViewMode: normalizeKeybinding(
            pickValue(diffView, ["toggle_view_mode", "toggleViewMode"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.toggleViewMode,
          ),
          toggleViewed: normalizeKeybinding(
            pickValue(diffView, ["toggle_viewed", "toggleViewed"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.toggleViewed,
          ),
          fold: normalizeKeybinding(
            pickValue(diffView, ["fold"]),
            DEFAULT_ORBIT_KEYBINDINGS.diffView.fold,
          ),
        },
        commentList: {
          quit: normalizeKeybinding(
            pickValue(commentList, ["quit"]),
            DEFAULT_ORBIT_KEYBINDINGS.commentList.quit,
          ),
          deleteComment: normalizeKeybinding(
            pickValue(commentList, ["delete_comment", "deleteComment"]),
            DEFAULT_ORBIT_KEYBINDINGS.commentList.deleteComment,
          ),
          editComment: normalizeKeybinding(
            pickValue(commentList, ["edit_comment", "editComment"]),
            DEFAULT_ORBIT_KEYBINDINGS.commentList.editComment,
          ),
        },
        promptPreview: {
          quit: normalizeKeybinding(
            pickValue(promptPreview, ["quit"]),
            DEFAULT_ORBIT_KEYBINDINGS.promptPreview.quit,
          ),
          copyPrompt: normalizeKeybinding(
            pickValue(promptPreview, ["copy_prompt", "copyPrompt"]),
            DEFAULT_ORBIT_KEYBINDINGS.promptPreview.copyPrompt,
          ),
        },
      },
    };
  } catch {
    return DEFAULT_ORBIT_CONFIG;
  }
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function saveOrbitConfig(
  config: OrbitConfig,
  configPath = getOrbitConfigPath(),
): void {
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    const width =
      Math.round(normalizeTreeWidth(config.fileTreeInitialWidth) * 100) / 100;
    const view = normalizeInitialView(config.initialView);
    const k = config.keybindings;
    const toml = [
      "# orbit custom configuration",
      `file_tree_initial_width = ${width}`,
      `initial_view = ${tomlString(view)}`,
      "",
      "[keybindings.file-tree]",
      `quit = ${tomlString(normalizeKeybinding(k.fileTree.quit, DEFAULT_ORBIT_KEYBINDINGS.fileTree.quit))}`,
      `tree_shrink = ${tomlString(normalizeKeybinding(k.fileTree.treeShrink, DEFAULT_ORBIT_KEYBINDINGS.fileTree.treeShrink))}`,
      `tree_grow = ${tomlString(normalizeKeybinding(k.fileTree.treeGrow, DEFAULT_ORBIT_KEYBINDINGS.fileTree.treeGrow))}`,
      `comment_list = ${tomlString(normalizeKeybinding(k.fileTree.commentList, DEFAULT_ORBIT_KEYBINDINGS.fileTree.commentList))}`,
      `prompt_preview = ${tomlString(normalizeKeybinding(k.fileTree.promptPreview, DEFAULT_ORBIT_KEYBINDINGS.fileTree.promptPreview))}`,
      `toggle_view_mode = ${tomlString(normalizeKeybinding(k.fileTree.toggleViewMode, DEFAULT_ORBIT_KEYBINDINGS.fileTree.toggleViewMode))}`,
      `toggle_viewed = ${tomlString(normalizeKeybinding(k.fileTree.toggleViewed, DEFAULT_ORBIT_KEYBINDINGS.fileTree.toggleViewed))}`,
      "",
      "[keybindings.diff-view]",
      `quit = ${tomlString(normalizeKeybinding(k.diffView.quit, DEFAULT_ORBIT_KEYBINDINGS.diffView.quit))}`,
      `comment = ${tomlString(normalizeKeybinding(k.diffView.comment, DEFAULT_ORBIT_KEYBINDINGS.diffView.comment))}`,
      `delete_comment = ${tomlString(normalizeKeybinding(k.diffView.deleteComment, DEFAULT_ORBIT_KEYBINDINGS.diffView.deleteComment))}`,
      `edit_comment = ${tomlString(normalizeKeybinding(k.diffView.editComment, DEFAULT_ORBIT_KEYBINDINGS.diffView.editComment))}`,
      `file_comment = ${tomlString(normalizeKeybinding(k.diffView.fileComment, DEFAULT_ORBIT_KEYBINDINGS.diffView.fileComment))}`,
      `toggle_view_mode = ${tomlString(normalizeKeybinding(k.diffView.toggleViewMode, DEFAULT_ORBIT_KEYBINDINGS.diffView.toggleViewMode))}`,
      `toggle_viewed = ${tomlString(normalizeKeybinding(k.diffView.toggleViewed, DEFAULT_ORBIT_KEYBINDINGS.diffView.toggleViewed))}`,
      `fold = ${tomlString(normalizeKeybinding(k.diffView.fold, DEFAULT_ORBIT_KEYBINDINGS.diffView.fold))}`,
      "",
      "[keybindings.comment-list]",
      `quit = ${tomlString(normalizeKeybinding(k.commentList.quit, DEFAULT_ORBIT_KEYBINDINGS.commentList.quit))}`,
      `delete_comment = ${tomlString(normalizeKeybinding(k.commentList.deleteComment, DEFAULT_ORBIT_KEYBINDINGS.commentList.deleteComment))}`,
      `edit_comment = ${tomlString(normalizeKeybinding(k.commentList.editComment, DEFAULT_ORBIT_KEYBINDINGS.commentList.editComment))}`,
      "",
      "[keybindings.prompt-preview]",
      `quit = ${tomlString(normalizeKeybinding(k.promptPreview.quit, DEFAULT_ORBIT_KEYBINDINGS.promptPreview.quit))}`,
      `copy_prompt = ${tomlString(normalizeKeybinding(k.promptPreview.copyPrompt, DEFAULT_ORBIT_KEYBINDINGS.promptPreview.copyPrompt))}`,
      "",
    ].join("\n");
    writeFileSync(configPath, toml);
  } catch {
    // Silently fail — config is best-effort
  }
}

export function ensureOrbitConfig(
  configPath = getOrbitConfigPath(),
): OrbitConfig {
  const config = loadOrbitConfig(configPath);
  if (!existsSync(configPath)) {
    saveOrbitConfig(config, configPath);
  }
  return config;
}
