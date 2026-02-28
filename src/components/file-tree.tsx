import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS, STATUS_ICONS } from "../constants.ts";
import type { ReviewComment } from "../types.ts";
import type { FlatTreeRow } from "../utils/file-tree.ts";

interface FileTreeProps {
  rows: FlatTreeRow[];
  selectedIndex: number;
  comments: ReviewComment[];
  viewedFiles: Set<string>;
  collapsedDirs: Set<string>;
  width: number;
  height: number;
  onSelectRow: (index: number) => void;
  onOpenFile: (index: number) => void;
}

export function FileTree({
  rows,
  selectedIndex,
  comments,
  viewedFiles,
  collapsedDirs,
  width,
  height,
  onSelectRow,
  onOpenFile,
}: FileTreeProps) {
  const lastClickRef = useRef<{ index: number; time: number }>({
    index: -1,
    time: 0,
  });

  const handleRowClick = useCallback(
    (index: number) => {
      const now = Date.now();
      const last = lastClickRef.current;
      if (last.index === index && now - last.time < 400) {
        onOpenFile(index);
      } else {
        onSelectRow(index);
      }
      lastClickRef.current = { index, time: now };
    },
    [onSelectRow, onOpenFile],
  );

  // Comment counts per file
  const commentCounts = new Map<string, number>();
  for (const c of comments) {
    commentCounts.set(c.filePath, (commentCounts.get(c.filePath) ?? 0) + 1);
  }

  // Viewport scrolling: only scroll when cursor leaves visible area
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    setScrollTop((prev) => {
      if (selectedIndex < prev) return selectedIndex;
      if (selectedIndex >= prev + height) return selectedIndex - height + 1;
      return prev;
    });
  }, [selectedIndex, height]);

  const startIdx = Math.max(0, Math.min(scrollTop, rows.length - height));
  const visibleRows = rows.slice(startIdx, startIdx + height);

  return (
    <box flexDirection="column" width={width} height={height}>
      {visibleRows.map((row, i) => {
        const realIdx = startIdx + i;
        const isSelected = realIdx === selectedIndex;
        const { node } = row;

        const indent = "  ".repeat(node.depth);
        const icon = node.isDir
          ? collapsedDirs.has(node.path)
            ? "\u25B8 " // ▸ collapsed
            : "\u25BE " // ▾ expanded
          : `${STATUS_ICONS[node.file?.status ?? ""] ?? " "} `;

        const name = node.isDir ? `${node.name}/` : node.name;

        // Stats for files only
        let suffix = "";
        if (node.file) {
          suffix += `  +${node.file.additions} -${node.file.deletions}`;
          const count = commentCounts.get(node.file.path) ?? 0;
          if (count > 0) suffix += `  ${count}`;
          if (viewedFiles.has(node.file.path)) suffix += " \u2713";
        }

        const line = `${indent}${icon}${name}`;

        if (isSelected) {
          const content = `${line}${suffix}`;
          const padded =
            content.length < width
              ? content + " ".repeat(width - content.length)
              : content;
          return (
            <text
              key={node.path}
              width={width}
              bg={COLORS.selected}
              color="white"
              bold
              onMouseDown={() => handleRowClick(realIdx)}
            >
              {padded}
            </text>
          );
        }

        if (node.isDir) {
          return (
            <text
              key={node.path}
              width={width}
              onMouseDown={() => handleRowClick(realIdx)}
            >
              {line}
            </text>
          );
        }

        return (
          <text
            key={node.path}
            width={width}
            onMouseDown={() => handleRowClick(realIdx)}
          >
            {`${line}  `}
            <span fg={COLORS.addition}>{`+${node.file!.additions}`}</span>{" "}
            <span fg={COLORS.deletion}>{`-${node.file!.deletions}`}</span>
            {(commentCounts.get(node.file!.path) ?? 0) > 0 ? (
              <span fg={COLORS.comment}>
                {`  ${commentCounts.get(node.file!.path)}`}
              </span>
            ) : null}
            {viewedFiles.has(node.file!.path) ? " \u2713" : ""}
          </text>
        );
      })}
    </box>
  );
}
