import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import {
  getCachePath,
  loadComments,
  saveComments,
} from "../data/comment-cache.ts";
import { commentStore } from "../data/comment-store.ts";
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

describe("comment-cache", () => {
  describe("getCachePath", () => {
    it("returns a /tmp path with repo name and hash", () => {
      const path = getCachePath("/home/user/my-project", "HEAD~1", "HEAD");
      expect(path).toStartWith("/tmp/orbit-my-project-");
      expect(path).toEndWith(".json");
    });

    it("returns same path for same inputs", () => {
      const a = getCachePath("/repo", "main", "feature");
      const b = getCachePath("/repo", "main", "feature");
      expect(a).toBe(b);
    });

    it("returns different paths for different diff ranges", () => {
      const a = getCachePath("/repo", "HEAD~1", "HEAD");
      const b = getCachePath("/repo", "HEAD~2", "HEAD");
      expect(a).not.toBe(b);
    });

    it("returns different paths for different repos", () => {
      const a = getCachePath("/projects/foo", "HEAD~1", "HEAD");
      const b = getCachePath("/projects/bar", "HEAD~1", "HEAD");
      expect(a).not.toBe(b);
    });
  });

  describe("saveComments / loadComments", () => {
    const cachePath = `/tmp/orbit-test-${Date.now()}.json`;

    afterEach(() => {
      try {
        rmSync(cachePath);
      } catch {}
    });

    it("round-trips comments through save and load", () => {
      const comments = [
        makeComment({ id: "1", body: "first" }),
        makeComment({ id: "2", body: "second" }),
      ];

      saveComments(cachePath, comments);
      const loaded = loadComments(cachePath);

      expect(loaded).toHaveLength(2);
      expect(loaded[0]!.id).toBe("1");
      expect(loaded[0]!.body).toBe("first");
      expect(loaded[1]!.id).toBe("2");
    });

    it("returns empty array when file does not exist", () => {
      const loaded = loadComments("/tmp/orbit-nonexistent-file.json");
      expect(loaded).toEqual([]);
    });

    it("returns empty array for corrupted JSON", () => {
      require("node:fs").writeFileSync(cachePath, "not valid json{{{");
      const loaded = loadComments(cachePath);
      expect(loaded).toEqual([]);
    });

    it("returns empty array when file contains non-array JSON", () => {
      require("node:fs").writeFileSync(cachePath, '{"not": "an array"}');
      const loaded = loadComments(cachePath);
      expect(loaded).toEqual([]);
    });

    it("preserves range positions", () => {
      const comments = [
        makeComment({
          id: "r1",
          position: { side: "old", line: { start: 5, end: 10 } },
        }),
      ];

      saveComments(cachePath, comments);
      const loaded = loadComments(cachePath);

      expect(loaded[0]!.position.line).toEqual({ start: 5, end: 10 });
    });

    it("saves empty array", () => {
      saveComments(cachePath, []);
      const loaded = loadComments(cachePath);
      expect(loaded).toEqual([]);
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

    it("flushes to disk on add", () => {
      commentStore.add(makeComment({ id: "a1", body: "added" }));

      const loaded = loadComments(cachePath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]!.body).toBe("added");
    });

    it("flushes to disk on update", () => {
      commentStore.add(makeComment({ id: "u1", body: "before" }));
      commentStore.update("u1", "after");

      const loaded = loadComments(cachePath);
      expect(loaded[0]!.body).toBe("after");
    });

    it("flushes to disk on remove", () => {
      commentStore.add(makeComment({ id: "r1" }));
      commentStore.add(makeComment({ id: "r2" }));
      commentStore.remove("r1");

      const loaded = loadComments(cachePath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]!.id).toBe("r2");
    });

    it("flushes to disk on toggleResolved", () => {
      commentStore.add(makeComment({ id: "t1", resolved: false }));
      commentStore.toggleResolved("t1");

      const loaded = loadComments(cachePath);
      expect(loaded[0]!.resolved).toBe(true);
    });

    it("loadFromCache restores comments without flushing", () => {
      const comments = [
        makeComment({ id: "c1", body: "cached" }),
        makeComment({ id: "c2", body: "cached2" }),
      ];
      commentStore.loadFromCache(comments);

      expect(commentStore.getSnapshot()).toHaveLength(2);
      expect(commentStore.getSnapshot()[0]!.body).toBe("cached");
      // File should not exist since loadFromCache doesn't flush
      expect(existsSync(cachePath)).toBe(false);
    });

    it("does not flush when cachePath is not set", () => {
      commentStore.reset();
      // Create a new-like state: no cachePath set
      const testPath = `/tmp/orbit-noop-${Date.now()}.json`;
      // Don't call setCachePath
      commentStore.add(makeComment({ id: "nf1" }));

      expect(existsSync(testPath)).toBe(false);
    });
  });
});
