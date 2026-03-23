import type { ReviewComment } from "../types.ts";
import { saveSessionComments } from "./persistence.ts";

type Listener = () => void;

class CommentStore {
  private comments: ReviewComment[] = [];
  private listeners = new Set<Listener>();
  private snapshotCache: ReviewComment[] | null = null;
  private cachePath: string | null = null;

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

  setCachePath(path: string) {
    this.cachePath = path;
  }

  /** Bulk-load comments from cache without triggering flush. */
  loadFromCache(comments: ReviewComment[]) {
    this.comments = [...comments];
    this.notify();
  }

  private flush() {
    if (this.cachePath) {
      saveSessionComments(this.cachePath, this.comments);
    }
  }

  private notify() {
    this.snapshotCache = null;
    for (const listener of this.listeners) {
      listener();
    }
  }

  add(comment: ReviewComment) {
    this.comments.push(comment);
    this.flush();
    this.notify();
  }

  update(id: string, body: string) {
    const comment = this.comments.find((c) => c.id === id);
    if (comment) {
      comment.body = body;
      comment.updatedAt = new Date().toISOString();
      this.flush();
      this.notify();
    }
  }

  remove(id: string) {
    const nextComments = this.comments.filter((c) => c.id !== id);
    if (nextComments.length === this.comments.length) return;
    this.comments = nextComments;
    this.flush();
    this.notify();
  }

  toggleResolved(id: string) {
    const comment = this.comments.find((c) => c.id === id);
    if (comment) {
      comment.resolved = !comment.resolved;
      comment.updatedAt = new Date().toISOString();
      this.flush();
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

  /** Reset all comments (for testing). */
  reset() {
    this.comments = [];
    this.notify();
  }
}

export const commentStore = new CommentStore();
