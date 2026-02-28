import type { DiffFile } from "../types.ts";

export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  file?: DiffFile;
  children: FileTreeNode[];
  depth: number;
}

export interface FlatTreeRow {
  node: FileTreeNode;
  fileIndex: number | null;
}

function sortNodes(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) {
    if (n.children.length > 0) sortNodes(n.children);
  }
}

export function buildFileTree(files: DiffFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const segments = file.path.split("/");
    let children = root;
    let pathSoFar = "";

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s]!;
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
      const isLast = s === segments.length - 1;

      let existing = children.find((n) => n.name === seg);
      if (!existing) {
        existing = {
          name: seg,
          path: pathSoFar,
          isDir: !isLast,
          file: isLast ? file : undefined,
          children: [],
          depth: s,
        };
        children.push(existing);
      }
      children = existing.children;
    }
  }

  sortNodes(root);
  return root;
}

export function flattenTree(
  roots: FileTreeNode[],
  files: DiffFile[],
  collapsed: Set<string>,
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];

  function walk(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      const fileIndex = node.file ? files.indexOf(node.file) : null;
      rows.push({ node, fileIndex });

      if (node.isDir && !collapsed.has(node.path)) {
        walk(node.children);
      }
    }
  }

  walk(roots);
  return rows;
}
