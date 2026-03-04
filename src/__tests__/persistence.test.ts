import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { commentStore } from "../data/comment-store.ts";
import {
  DEFAULT_ORBIT_CONFIG,
  getOrbitConfigPath,
  getSessionCachePath,
  loadOrbitConfig,
  loadSessionState,
  saveOrbitConfig,
  saveSessionComments,
  saveSessionPrefs,
  saveSessionViewedFiles,
} from "../data/persistence.ts";
import type { ReviewComment } from "../types.ts";

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: crypto.randomUUID(),
    filePath: "src/main.ts",
    body: "test comment",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    position: { side: "new", line: 10 },
    resolved: false,
    ...overrides,
  };
}

describe("session persistence", () => {
  describe("getSessionCachePath", () => {
    it("returns a /tmp path with repo name and hash", () => {
      const path = getSessionCachePath(
        "/home/user/my-project",
        "HEAD~1",
        "HEAD",
      );
      expect(path).toStartWith("/tmp/orbit-my-project-");
      expect(path).toEndWith(".json");
    });

    it("returns same path for same inputs", () => {
      const a = getSessionCachePath("/repo", "main", "feature");
      const b = getSessionCachePath("/repo", "main", "feature");
      expect(a).toBe(b);
    });

    it("returns different paths for different diff ranges", () => {
      const a = getSessionCachePath("/repo", "HEAD~1", "HEAD");
      const b = getSessionCachePath("/repo", "HEAD~2", "HEAD");
      expect(a).not.toBe(b);
    });

    it("returns different paths for different repos", () => {
      const a = getSessionCachePath("/projects/foo", "HEAD~1", "HEAD");
      const b = getSessionCachePath("/projects/bar", "HEAD~1", "HEAD");
      expect(a).not.toBe(b);
    });
  });

  describe("single file round trip", () => {
    const cachePath = `/tmp/orbit-test-${Date.now()}.json`;

    afterEach(() => {
      try {
        rmSync(cachePath);
      } catch {}
    });

    it("stores comments, viewed files, and prefs in one file", () => {
      saveSessionComments(cachePath, [makeComment({ id: "1" })]);
      saveSessionViewedFiles(cachePath, new Set(["src/main.ts", "src/lib.ts"]));
      saveSessionPrefs(cachePath, { treePercent: 0.3 });

      const loaded = loadSessionState(cachePath);
      expect(loaded.comments).toHaveLength(1);
      expect(loaded.comments[0]!.id).toBe("1");
      expect(loaded.viewedFiles.has("src/main.ts")).toBe(true);
      expect(loaded.viewedFiles.has("src/lib.ts")).toBe(true);
      expect(loaded.prefs.treePercent).toBe(0.3);
    });

    it("returns empty defaults when file does not exist", () => {
      const loaded = loadSessionState("/tmp/orbit-nonexistent-file.json");
      expect(loaded.comments).toEqual([]);
      expect([...loaded.viewedFiles]).toEqual([]);
      expect(loaded.prefs).toEqual({});
    });

    it("returns empty defaults for corrupted JSON", () => {
      writeFileSync(cachePath, "not valid json{{{");
      const loaded = loadSessionState(cachePath);
      expect(loaded.comments).toEqual([]);
      expect([...loaded.viewedFiles]).toEqual([]);
      expect(loaded.prefs).toEqual({});
    });

    it("keeps existing data when saving partial updates", () => {
      saveSessionComments(cachePath, [makeComment({ id: "keep" })]);
      saveSessionViewedFiles(cachePath, new Set(["src/main.ts"]));
      saveSessionPrefs(cachePath, { treePercent: 0.25 });
      saveSessionComments(cachePath, [makeComment({ id: "replace" })]);

      const loaded = loadSessionState(cachePath);
      expect(loaded.comments).toHaveLength(1);
      expect(loaded.comments[0]!.id).toBe("replace");
      expect(loaded.viewedFiles.has("src/main.ts")).toBe(true);
      expect(loaded.prefs.treePercent).toBe(0.25);
    });
  });

  describe("CommentStore cache integration", () => {
    const cachePath = `/tmp/orbit-store-test-${Date.now()}.json`;

    beforeEach(() => {
      commentStore.reset();
      commentStore.setCachePath(cachePath);
    });

    afterEach(() => {
      commentStore.reset();
      try {
        rmSync(cachePath);
      } catch {}
    });

    it("flushes comments into session file on add", () => {
      saveSessionViewedFiles(cachePath, new Set(["src/existing.ts"]));
      saveSessionPrefs(cachePath, { treePercent: 0.33 });

      commentStore.add(makeComment({ id: "a1", body: "added" }));

      const loaded = loadSessionState(cachePath);
      expect(loaded.comments).toHaveLength(1);
      expect(loaded.comments[0]!.body).toBe("added");
      expect(loaded.viewedFiles.has("src/existing.ts")).toBe(true);
      expect(loaded.prefs.treePercent).toBe(0.33);
    });

    it("loadFromCache restores comments without flushing", () => {
      const comments = [
        makeComment({ id: "c1", body: "cached" }),
        makeComment({ id: "c2", body: "cached2" }),
      ];
      commentStore.loadFromCache(comments);

      expect(commentStore.getSnapshot()).toHaveLength(2);
      expect(commentStore.getSnapshot()[0]!.body).toBe("cached");
      expect(existsSync(cachePath)).toBe(false);
    });
  });
});

describe("orbit config", () => {
  const tmpRoot = `/tmp/orbit-config-test-${Date.now()}`;
  const configPath = join(tmpRoot, "orbit", "config.toml");

  afterEach(() => {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("returns defaults when file is missing", () => {
    expect(loadOrbitConfig(configPath)).toEqual(DEFAULT_ORBIT_CONFIG);
  });

  it("loads configured values from TOML", () => {
    mkdirSync(join(tmpRoot, "orbit"), { recursive: true });
    writeFileSync(
      configPath,
      [
        "file-tree-initial-width = 0.3",
        'initial-view = "split"',
        "incremental-fold-lines = 7",
        "",
        "[keybindings.file-tree]",
        'prompt-preview = "o"',
        'toggle-view-mode = "m"',
        "",
        "[keybindings.diff-view]",
        'comment = "x"',
      ].join("\n"),
    );

    const loaded = loadOrbitConfig(configPath);
    expect(loaded.fileTreeInitialWidth).toBe(0.3);
    expect(loaded.initialView).toBe("split");
    expect(loaded.incrementalFoldLines).toBe(7);
    expect(loaded.keybindings.fileTree.promptPreview).toBe("o");
    expect(loaded.keybindings.fileTree.toggleViewMode).toBe("m");
    expect(loaded.keybindings.diffView.comment).toBe("x");
    expect(loaded.keybindings.commentList.editComment).toBe("e");
  });

  it("does not read legacy flat keybindings", () => {
    mkdirSync(join(tmpRoot, "orbit"), { recursive: true });
    writeFileSync(
      configPath,
      [
        "file-tree-initial-width = 0.2",
        'initial-view = "unified"',
        "incremental-fold-lines = 11",
        "",
        "[keybindings]",
        'prompt-preview = "o"',
        'toggle-view-mode = "m"',
      ].join("\n"),
    );

    const loaded = loadOrbitConfig(configPath);
    expect(loaded.keybindings.fileTree.promptPreview).toBe("p");
    expect(loaded.keybindings.fileTree.toggleViewMode).toBe("t");
    expect(loaded.incrementalFoldLines).toBe(11);
  });

  it("saves config as TOML", () => {
    saveOrbitConfig(
      {
        ...DEFAULT_ORBIT_CONFIG,
        fileTreeInitialWidth: 0.35,
        initialView: "split",
        keybindings: {
          ...DEFAULT_ORBIT_CONFIG.keybindings,
          fileTree: {
            ...DEFAULT_ORBIT_CONFIG.keybindings.fileTree,
            promptPreview: "o",
          },
        },
      },
      configPath,
    );

    const text = readFileSync(configPath, "utf-8");
    expect(text).toContain("file-tree-initial-width = 0.35");
    expect(text).toContain('initial-view = "split"');
    expect(text).toContain(
      `incremental-fold-lines = ${DEFAULT_ORBIT_CONFIG.incrementalFoldLines}`,
    );
    expect(text).toContain("[keybindings.file-tree]");
    expect(text).toContain('prompt-preview = "o"');
    expect(text).toContain("[keybindings.diff-view]");
  });

  it("builds config path from XDG_CONFIG_HOME", () => {
    const env = {
      HOME: "/home/tester",
      XDG_CONFIG_HOME: "/tmp/custom-config",
    } as NodeJS.ProcessEnv;

    const path = getOrbitConfigPath(env);
    expect(path).toBe("/tmp/custom-config/orbit/config.toml");
  });
});
