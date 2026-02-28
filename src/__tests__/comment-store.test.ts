import { beforeEach, describe, expect, it, mock } from "bun:test";
import { commentStore } from "../data/comment-store.ts";
import type { ReviewComment } from "../types.ts";

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: crypto.randomUUID(),
    filePath: "src/main.py",
    body: "test comment",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    position: { side: "new", line: 10 },
    resolved: false,
    ...overrides,
  };
}

describe("CommentStore", () => {
  beforeEach(() => {
    commentStore.reset();
  });

  describe("subscribe / getSnapshot", () => {
    it("starts empty", () => {
      expect(commentStore.getSnapshot()).toEqual([]);
    });

    it("notifies listeners on add", () => {
      const listener = mock(() => {});
      commentStore.subscribe(listener);

      commentStore.add(makeComment());

      expect(listener).toHaveBeenCalled();
    });

    it("unsubscribe stops notifications", () => {
      const listener = mock(() => {});
      const unsub = commentStore.subscribe(listener);
      unsub();

      commentStore.add(makeComment());

      expect(listener).not.toHaveBeenCalled();
    });

    it("getSnapshot returns same reference when unchanged", () => {
      commentStore.add(makeComment());
      const snap1 = commentStore.getSnapshot();
      const snap2 = commentStore.getSnapshot();

      expect(snap1).toBe(snap2);
    });

    it("getSnapshot returns new reference after change", () => {
      commentStore.add(makeComment());
      const snap1 = commentStore.getSnapshot();

      commentStore.add(makeComment());
      const snap2 = commentStore.getSnapshot();

      expect(snap1).not.toBe(snap2);
    });

    it("multiple listeners all get notified", () => {
      const l1 = mock(() => {});
      const l2 = mock(() => {});
      commentStore.subscribe(l1);
      commentStore.subscribe(l2);

      commentStore.add(makeComment());

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });
  });

  describe("add", () => {
    it("adds a comment", () => {
      const c = makeComment({ body: "hello" });
      commentStore.add(c);

      const all = commentStore.getSnapshot();
      expect(all).toHaveLength(1);
      expect(all[0]!.body).toBe("hello");
    });

    it("adds multiple comments in order", () => {
      commentStore.add(makeComment({ id: "a", body: "first" }));
      commentStore.add(makeComment({ id: "b", body: "second" }));
      commentStore.add(makeComment({ id: "c", body: "third" }));

      const all = commentStore.getSnapshot();
      expect(all).toHaveLength(3);
      expect(all.map((c) => c.body)).toEqual(["first", "second", "third"]);
    });
  });

  describe("update", () => {
    it("updates comment body", () => {
      const c = makeComment({ id: "upd-1", body: "original" });
      commentStore.add(c);

      commentStore.update("upd-1", "updated");

      const snap = commentStore.getSnapshot();
      expect(snap.find((x) => x.id === "upd-1")?.body).toBe("updated");
    });

    it("updates updatedAt timestamp", () => {
      const c = makeComment({ id: "upd-2", updatedAt: "2020-01-01T00:00:00Z" });
      commentStore.add(c);

      commentStore.update("upd-2", "new body");

      const snap = commentStore.getSnapshot();
      const updated = snap.find((x) => x.id === "upd-2");
      expect(updated?.updatedAt).not.toBe("2020-01-01T00:00:00Z");
    });

    it("no-ops for non-existent id", () => {
      const listener = mock(() => {});
      commentStore.add(makeComment());
      commentStore.subscribe(listener);
      listener.mockClear();

      commentStore.update("nonexistent", "whatever");

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes a comment", () => {
      const c = makeComment({ id: "rm-1" });
      commentStore.add(c);
      expect(commentStore.getSnapshot()).toHaveLength(1);

      commentStore.remove("rm-1");

      expect(commentStore.getSnapshot()).toHaveLength(0);
    });

    it("removes only the targeted comment", () => {
      commentStore.add(makeComment({ id: "keep" }));
      commentStore.add(makeComment({ id: "remove" }));
      commentStore.add(makeComment({ id: "keep2" }));

      commentStore.remove("remove");

      const ids = commentStore.getSnapshot().map((c) => c.id);
      expect(ids).toEqual(["keep", "keep2"]);
    });

    it("no-ops for non-existent id", () => {
      commentStore.add(makeComment());
      commentStore.remove("nonexistent");
      expect(commentStore.getSnapshot()).toHaveLength(1);
    });
  });

  describe("toggleResolved", () => {
    it("toggles resolved flag", () => {
      const c = makeComment({ id: "res-1", resolved: false });
      commentStore.add(c);

      commentStore.toggleResolved("res-1");
      expect(
        commentStore.getSnapshot().find((x) => x.id === "res-1")?.resolved,
      ).toBe(true);

      commentStore.toggleResolved("res-1");
      expect(
        commentStore.getSnapshot().find((x) => x.id === "res-1")?.resolved,
      ).toBe(false);
    });

    it("updates timestamp on toggle", () => {
      const c = makeComment({
        id: "res-2",
        resolved: false,
        updatedAt: "2020-01-01T00:00:00Z",
      });
      commentStore.add(c);

      commentStore.toggleResolved("res-2");

      const updated = commentStore.getSnapshot().find((x) => x.id === "res-2");
      expect(updated?.updatedAt).not.toBe("2020-01-01T00:00:00Z");
    });
  });

  describe("getForFile / getForLine", () => {
    it("getForFile filters by filePath", () => {
      commentStore.add(makeComment({ id: "f1", filePath: "a.ts" }));
      commentStore.add(makeComment({ id: "f2", filePath: "b.ts" }));
      commentStore.add(makeComment({ id: "f3", filePath: "a.ts" }));

      expect(commentStore.getForFile("a.ts")).toHaveLength(2);
      expect(commentStore.getForFile("b.ts")).toHaveLength(1);
      expect(commentStore.getForFile("c.ts")).toHaveLength(0);
    });

    it("getForLine with single line", () => {
      commentStore.add(
        makeComment({
          id: "l1",
          filePath: "a.ts",
          position: { side: "new", line: 5 },
        }),
      );
      commentStore.add(
        makeComment({
          id: "l2",
          filePath: "a.ts",
          position: { side: "new", line: 10 },
        }),
      );

      expect(commentStore.getForLine("a.ts", 5, "new")).toHaveLength(1);
      expect(commentStore.getForLine("a.ts", 10, "new")).toHaveLength(1);
      expect(commentStore.getForLine("a.ts", 7, "new")).toHaveLength(0);
    });

    it("getForLine with range", () => {
      commentStore.add(
        makeComment({
          id: "r1",
          filePath: "a.ts",
          position: { side: "new", line: { start: 5, end: 10 } },
        }),
      );

      expect(commentStore.getForLine("a.ts", 5, "new")).toHaveLength(1);
      expect(commentStore.getForLine("a.ts", 7, "new")).toHaveLength(1);
      expect(commentStore.getForLine("a.ts", 10, "new")).toHaveLength(1);
      expect(commentStore.getForLine("a.ts", 4, "new")).toHaveLength(0);
      expect(commentStore.getForLine("a.ts", 11, "new")).toHaveLength(0);
    });

    it("getForLine filters by side", () => {
      commentStore.add(
        makeComment({
          id: "s1",
          filePath: "a.ts",
          position: { side: "new", line: 5 },
        }),
      );

      expect(commentStore.getForLine("a.ts", 5, "new")).toHaveLength(1);
      expect(commentStore.getForLine("a.ts", 5, "old")).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("clears all comments", () => {
      commentStore.add(makeComment());
      commentStore.add(makeComment());
      expect(commentStore.getSnapshot()).toHaveLength(2);

      commentStore.reset();

      expect(commentStore.getSnapshot()).toHaveLength(0);
    });

    it("notifies listeners on reset", () => {
      commentStore.add(makeComment());
      const listener = mock(() => {});
      commentStore.subscribe(listener);

      commentStore.reset();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe("getAll", () => {
    it("returns a copy of all comments", () => {
      commentStore.add(makeComment({ id: "a" }));
      commentStore.add(makeComment({ id: "b" }));

      const all = commentStore.getAll();
      expect(all).toHaveLength(2);

      // Mutating the returned array should not affect the store
      all.pop();
      expect(commentStore.getAll()).toHaveLength(2);
    });
  });
});
