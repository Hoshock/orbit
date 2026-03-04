export interface ReviewComment {
  id: string;
  filePath: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  position: {
    side: "old" | "new";
    line: number | { start: number; end: number };
  };
  codeSnapshot?: { content: string; language?: string };
  resolved: boolean;
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  rawDiff: string;
  isGenerated: boolean;
}

export type AppMode =
  | "file-list"
  | "diff-view"
  | "comment-input"
  | "comment-list"
  | "prompt-preview";

export interface OrbitSession {
  base: string;
  target: string;
  repoRoot: string;
  files: DiffFile[];
  viewedFiles: Set<string>;
}

export interface CliOptions {
  base: string;
  target: string;
  splitMode: boolean;
  root: boolean;
  includeUntracked: boolean;
  paths: string[];
  /** Short hash for old (base) side, resolved at startup */
  oldHash?: string;
  /** Short hash for new (target) side, resolved at startup */
  newHash?: string;
}

export type OrbitInitialView = "unified" | "split";

export interface OrbitFileTreeKeybindings {
  quit: string;
  commentList: string;
  promptPreview: string;
  toggleViewMode: string;
  toggleViewed: string;
  treeShrink: string;
  treeGrow: string;
}

export interface OrbitDiffViewKeybindings {
  quit: string;
  comment: string;
  deleteComment: string;
  editComment: string;
  fileComment: string;
  toggleViewMode: string;
  toggleViewed: string;
  fold: string;
}

export interface OrbitCommentListKeybindings {
  quit: string;
  deleteComment: string;
  editComment: string;
}

export interface OrbitPromptPreviewKeybindings {
  quit: string;
  copyPrompt: string;
}

export interface OrbitKeybindings {
  fileTree: OrbitFileTreeKeybindings;
  diffView: OrbitDiffViewKeybindings;
  commentList: OrbitCommentListKeybindings;
  promptPreview: OrbitPromptPreviewKeybindings;
}

export interface OrbitConfig {
  fileTreeInitialWidth: number;
  initialView: OrbitInitialView;
  keybindings: OrbitKeybindings;
}
