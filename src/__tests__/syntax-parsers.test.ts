import { beforeAll, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TreeSitterClient } from "@opentui/core";
import {
  CUSTOM_SYNTAX_FILETYPES,
  registerSyntaxParsers,
} from "../syntax-parsers.ts";

describe("registerSyntaxParsers", () => {
  beforeAll(() => {
    registerSyntaxParsers();
  });

  it("includes bundled config-language parsers", () => {
    expect(CUSTOM_SYNTAX_FILETYPES).toEqual(["python", "json", "toml", "yaml"]);
  });

  it("registers bundled parsers without throwing", () => {
    expect(() => registerSyntaxParsers()).not.toThrow();
  });

  it("loads the yaml parser through the standard tree-sitter client", async () => {
    const client = new TreeSitterClient({
      dataPath: join(tmpdir(), "orbit-tree-sitter-test"),
    });

    try {
      const result = await Promise.race([
        client.highlightOnce("foo:\n  bar: baz\n", "yaml"),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("yaml highlight timed out")),
            3_000,
          ),
        ),
      ]);

      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
      expect(result.highlights?.length ?? 0).toBeGreaterThan(0);
    } finally {
      await client.destroy();
    }
  });

  it("does not highlight plain yaml scalar values as strings", async () => {
    const client = new TreeSitterClient({
      dataPath: join(tmpdir(), "orbit-tree-sitter-test"),
    });

    try {
      const text = "foo:\n  bar: baz\n  count: 1\n  ok: true\n";
      const result = await client.highlightOnce(text, "yaml");
      const highlights = result.highlights ?? [];
      const bazStart = text.indexOf("baz");
      const bazEnd = bazStart + "baz".length;
      const countStart = text.indexOf("1");
      const okStart = text.indexOf("true");
      const groupsAt = (start: number, end: number) =>
        highlights
          .filter(([hStart, hEnd]) => hStart <= start && hEnd >= end)
          .map(([, , group]) => group);

      expect(groupsAt(bazStart, bazEnd)).not.toContain("string");
      expect(groupsAt(countStart, countStart + 1)).toContain("number");
      expect(groupsAt(okStart, okStart + 4)).toContain("boolean");
    } finally {
      await client.destroy();
    }
  });
});
