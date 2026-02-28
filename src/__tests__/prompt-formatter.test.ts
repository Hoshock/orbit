import { describe, expect, it } from "bun:test";
import { formatPrompt } from "../data/prompt-formatter.ts";
import type { ReviewComment } from "../types.ts";

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "test-id",
    filePath: "src/main.py",
    body: "早期returnにすべき",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    position: { side: "new", line: 43 },
    resolved: false,
    ...overrides,
  };
}

const hashes = { oldHash: "ab2244", newHash: "cf3891" };

describe("formatPrompt", () => {
  it("returns empty string for no comments", () => {
    expect(formatPrompt([])).toBe("");
  });

  it("uses commit hashes instead of old/new", () => {
    const comment = makeComment();
    const result = formatPrompt([comment], hashes);

    expect(result).toContain("src/main.py:L43 (cf3891)");
    expect(result).not.toContain("(new)");
  });

  it("uses old hash for old-side comments", () => {
    const comment = makeComment({
      position: { side: "old", line: 17 },
      body: "この処理は必要だった",
    });
    const result = formatPrompt([comment], hashes);

    expect(result).toContain("src/main.py:L17 (ab2244)");
    expect(result).not.toContain("(old)");
  });

  it("falls back to old/new when no hashes provided", () => {
    const comment = makeComment();
    const result = formatPrompt([comment]);

    expect(result).toContain("src/main.py:L43 (new)");
  });

  it("separates multiple comments with ==========", () => {
    const c1 = makeComment({ id: "1", position: { side: "new", line: 43 } });
    const c2 = makeComment({
      id: "2",
      filePath: "src/utils.py",
      body: "既存helper使って",
      position: { side: "new", line: 10 },
    });
    const result = formatPrompt([c1, c2], hashes);

    expect(result).toContain("==========");
    expect(result).toContain("src/main.py:L43 (cf3891)");
    expect(result).toContain("src/utils.py:L10 (cf3891)");
  });

  it("skips resolved comments", () => {
    const resolved = makeComment({ resolved: true });
    const active = makeComment({
      id: "2",
      filePath: "src/other.py",
      body: "active comment",
      resolved: false,
    });
    const result = formatPrompt([resolved, active]);

    expect(result).not.toContain("早期returnにすべき");
    expect(result).toContain("active comment");
  });

  it("returns empty string when all comments are resolved", () => {
    const resolved = makeComment({ resolved: true });
    expect(formatPrompt([resolved])).toBe("");
  });

  it("handles range line positions", () => {
    const comment = makeComment({
      position: { side: "new", line: { start: 10, end: 15 } },
    });
    const result = formatPrompt([comment], hashes);

    expect(result).toContain("src/main.py:L10-L15 (cf3891)");
  });

  it("handles file-level comment (line=0) without hash", () => {
    const comment = makeComment({
      position: { side: "new", line: 0 },
      body: "このファイル全体をリファクタリング",
    });
    const result = formatPrompt([comment], hashes);

    expect(result).toContain("src/main.py\n");
    expect(result).not.toContain(":L0");
    expect(result).not.toContain("(cf3891)");
  });

  it("includes suggestion block as-is", () => {
    const comment = makeComment({
      body: "ORIGINAL:\n  result = process(data)\nSUGGESTED:\n  result = validate_and_process(data)",
    });
    const result = formatPrompt([comment]);

    expect(result).toContain("ORIGINAL:");
    expect(result).toContain("SUGGESTED:");
  });

  it("does not include code snapshots even if present", () => {
    const comment = makeComment({
      codeSnapshot: { content: "+    if result is None:" },
    });
    const result = formatPrompt([comment]);

    expect(result).not.toContain("> +    if result is None:");
  });
});
