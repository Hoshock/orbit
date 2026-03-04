import { describe, expect, it } from "bun:test";
import type { DiffFile } from "../types.ts";
import {
  buildFileTree,
  flattenTree,
  getNodeFilePaths,
  isNodeViewed,
} from "../utils/file-tree.ts";

function makeFile(path: string, status = "modified"): DiffFile {
  return {
    path,
    status: status as DiffFile["status"],
    additions: 1,
    deletions: 0,
    rawDiff: "",
    isGenerated: false,
  };
}

describe("buildFileTree", () => {
  it("creates tree from flat files", () => {
    const files = [makeFile("src/a.ts"), makeFile("src/b.ts")];
    const tree = buildFileTree(files);

    expect(tree).toHaveLength(1); // "src" dir
    expect(tree[0]!.name).toBe("src");
    expect(tree[0]!.isDir).toBe(true);
    expect(tree[0]!.children).toHaveLength(2);
  });

  it("places root-level files at depth 0", () => {
    const files = [makeFile("README.md"), makeFile("package.json")];
    const tree = buildFileTree(files);

    expect(tree).toHaveLength(2);
    expect(tree[0]!.depth).toBe(0);
    expect(tree[0]!.isDir).toBe(false);
  });

  it("sorts directories before files", () => {
    const files = [makeFile("z.ts"), makeFile("src/a.ts"), makeFile("a.ts")];
    const tree = buildFileTree(files);

    expect(tree[0]!.name).toBe("src"); // dir first
    expect(tree[0]!.isDir).toBe(true);
    expect(tree[1]!.name).toBe("a.ts"); // then files alphabetically
    expect(tree[2]!.name).toBe("z.ts");
  });

  it("handles nested directories", () => {
    const files = [makeFile("src/components/diff.tsx")];
    const tree = buildFileTree(files);

    expect(tree[0]!.name).toBe("src");
    expect(tree[0]!.children[0]!.name).toBe("components");
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("diff.tsx");
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
  });

  it("groups files in same directory", () => {
    const files = [
      makeFile("src/a.ts"),
      makeFile("src/b.ts"),
      makeFile("lib/c.ts"),
    ];
    const tree = buildFileTree(files);

    expect(tree).toHaveLength(2); // lib, src
    expect(tree[0]!.name).toBe("lib");
    expect(tree[1]!.name).toBe("src");
  });
});

describe("flattenTree", () => {
  const files = [
    makeFile("src/components/a.tsx"),
    makeFile("src/components/b.tsx"),
    makeFile("src/utils.ts"),
    makeFile("README.md"),
  ];
  const tree = buildFileTree(files);

  it("lists all nodes when nothing is collapsed", () => {
    const rows = flattenTree(tree, files, new Set());

    // src/, src/components/, a.tsx, b.tsx, src/utils.ts, README.md
    expect(rows).toHaveLength(6);
    expect(rows[0]!.node.name).toBe("src");
    expect(rows[0]!.fileIndex).toBeNull();
    expect(rows[5]!.node.name).toBe("README.md");
    expect(rows[5]!.fileIndex).toBe(3);
  });

  it("hides children when directory is collapsed", () => {
    const collapsed = new Set(["src"]);
    const rows = flattenTree(tree, files, collapsed);

    // src/ (collapsed), README.md
    expect(rows).toHaveLength(2);
    expect(rows[0]!.node.name).toBe("src");
    expect(rows[1]!.node.name).toBe("README.md");
  });

  it("collapses nested directory independently", () => {
    const collapsed = new Set(["src/components"]);
    const rows = flattenTree(tree, files, collapsed);

    // src/, src/components/ (collapsed), src/utils.ts, README.md
    expect(rows).toHaveLength(4);
    expect(rows[1]!.node.name).toBe("components");
    expect(rows[2]!.node.name).toBe("utils.ts");
  });

  it("provides correct fileIndex mapping", () => {
    const rows = flattenTree(tree, files, new Set());
    const fileRows = rows.filter((r) => r.fileIndex !== null);

    expect(fileRows).toHaveLength(4);
    // Each file should map to its index in the original files array
    for (const row of fileRows) {
      expect(files[row.fileIndex!]!.path).toBe(row.node.path);
    }
  });
});

describe("tree viewed helpers", () => {
  const files = [
    makeFile("src/a.ts"),
    makeFile("src/nested/b.ts"),
    makeFile("README.md"),
  ];
  const tree = buildFileTree(files);

  it("collects descendant file paths for directory nodes", () => {
    const srcDir = tree.find((n) => n.path === "src");
    expect(srcDir).toBeDefined();
    if (!srcDir) return;

    expect(getNodeFilePaths(srcDir)).toEqual(["src/nested/b.ts", "src/a.ts"]);
  });

  it("treats directories as viewed only when all descendants are viewed", () => {
    const srcDir = tree.find((n) => n.path === "src");
    expect(srcDir).toBeDefined();
    if (!srcDir) return;

    expect(isNodeViewed(srcDir, new Set(["src/a.ts"]))).toBe(false);
    expect(isNodeViewed(srcDir, new Set(["src/a.ts", "src/nested/b.ts"]))).toBe(
      true,
    );
  });
});
