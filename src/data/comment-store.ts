import type { ReviewComment } from "../types.ts";
import {
  loadComments,
  type StorageKey,
  saveComments,
} from "./comment-storage.ts";

type Listener = () => void;

class CommentStore {
  private comments: ReviewComment[] = [];
  private listeners = new Set<Listener>();
  private snapshotCache: ReviewComment[] | null = null;
  private storageKey: StorageKey | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ReviewComment[] => {
    if (!this.snapshotCache) {
      this.snapshotCache = [...this.comments];
    }
    return this.snapshotCache;
  };

  private notify() {
    this.snapshotCache = null;
    for (const listener of this.listeners) {
      listener();
    }
    this.persist();
  }

  init(key: StorageKey) {
    this.storageKey = key;
    this.comments = loadComments(key);
    this.notify();
  }

  add(comment: ReviewComment) {
    this.comments.push(comment);
    this.notify();
  }

  update(id: string, body: string) {
    const comment = this.comments.find((c) => c.id === id);
    if (comment) {
      comment.body = body;
      comment.updatedAt = new Date().toISOString();
      this.notify();
    }
  }

  remove(id: string) {
    this.comments = this.comments.filter((c) => c.id !== id);
    this.notify();
  }

  toggleResolved(id: string) {
    const comment = this.comments.find((c) => c.id === id);
    if (comment) {
      comment.resolved = !comment.resolved;
      comment.updatedAt = new Date().toISOString();
      this.notify();
    }
  }

  getForFile(filePath: string): ReviewComment[] {
    return this.comments.filter((c) => c.filePath === filePath);
  }

  getForLine(
    filePath: string,
    line: number,
    side: "old" | "new",
  ): ReviewComment[] {
    return this.comments.filter((c) => {
      if (c.filePath !== filePath || c.position.side !== side) return false;
      if (typeof c.position.line === "number") return c.position.line === line;
      return line >= c.position.line.start && line <= c.position.line.end;
    });
  }

  getAll(): ReviewComment[] {
    return [...this.comments];
  }

  private persist() {
    if (this.storageKey) {
      saveComments(this.storageKey, this.comments);
    }
  }
}

export const commentStore = new CommentStore();
