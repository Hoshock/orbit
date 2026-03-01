import type { MouseEvent } from "@opentui/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS } from "../constants.ts";
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

type Segment = { text: string; color?: string };

/** Slice segments into a viewport window [scrollLeft, scrollLeft+width). */
function sliceSegments(
  segments: Segment[],
  scrollLeft: number,
  maxWidth: number,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let pos = 0;
  let remaining = maxWidth;

  for (let i = 0; i < segments.length; i++) {
    if (remaining <= 0) break;
    const seg = segments[i];
    const segEnd = pos + seg.text.length;

    if (segEnd <= scrollLeft) {
      pos = segEnd;
      continue;
    }

    const visibleStart = Math.max(0, scrollLeft - pos);
    const visibleText = seg.text.slice(visibleStart, visibleStart + remaining);

    if (visibleText.length > 0) {
      if (seg.color) {
        nodes.push(
          <span key={i} fg={seg.color}>
            {visibleText}
          </span>,
        );
      } else {
        nodes.push(visibleText);
      }
      remaining -= visibleText.length;
    }
    pos = segEnd;
  }

  return nodes;
}

/** Build segments for a row (with color info). */
function rowSegments(
  row: FlatTreeRow,
  collapsedDirs: Set<string>,
  commentCounts: Map<string, number>,
  viewedFiles: Set<string>,
): Segment[] {
  const { node } = row;
  const indent = "  ".repeat(node.depth);
  const name = node.isDir ? `${node.name}/` : node.name;

  if (!node.file) {
    const dirIcon = collapsedDirs.has(node.path) ? "\u25B8 " : "\u25BE ";
    return [{ text: `${indent}${dirIcon}${name}` }];
  }

  const viewed = viewedFiles.has(node.file.path);
  const check = viewed ? "\u2713 " : "  ";
  const segments: Segment[] = [
    { text: `${indent}`, color: viewed ? COLORS.comment : undefined },
    { text: check, color: viewed ? COLORS.comment : undefined },
    {
      text: `${name}  `,
      color: viewed ? COLORS.comment : undefined,
    },
    { text: `+${node.file.additions}`, color: COLORS.addition },
    { text: " " },
    { text: `-${node.file.deletions}`, color: COLORS.deletion },
  ];
  const count = commentCounts.get(node.file.path) ?? 0;
  if (count > 0) {
    segments.push({ text: `  ${count}`, color: COLORS.comment });
  }
  return segments;
}

/** Total character length of segments. */
function segmentsLength(segments: Segment[]): number {
  let len = 0;
  for (const s of segments) len += s.text.length;
  return len;
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

  // Max content width → determines if horizontal scroll is needed
  let maxContentWidth = 0;
  for (const row of rows) {
    const len = segmentsLength(
      rowSegments(row, collapsedDirs, commentCounts, viewedFiles),
    );
    if (len > maxContentWidth) maxContentWidth = len;
  }
  const maxScrollLeft = Math.max(0, maxContentWidth - width);

  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const effectiveScrollLeft = Math.min(scrollLeft, maxScrollLeft);

  useEffect(() => {
    setScrollTop((prev) => {
      if (selectedIndex < prev) return selectedIndex;
      if (selectedIndex >= prev + height) return selectedIndex - height + 1;
      return prev;
    });
  }, [selectedIndex, height]);

  const handleMouseScroll = useCallback(
    (event: MouseEvent) => {
      const dir = event.scroll?.direction;
      const delta = event.scroll?.delta ?? 1;
      if (dir === "up") {
        setScrollTop((prev) => Math.max(0, prev - delta));
      } else if (dir === "down") {
        setScrollTop((prev) =>
          Math.min(Math.max(0, rows.length - height), prev + delta),
        );
      } else if (dir === "left" && maxScrollLeft > 0) {
        setScrollLeft((prev) => Math.max(0, prev - delta));
      } else if (dir === "right" && maxScrollLeft > 0) {
        setScrollLeft((prev) => Math.min(maxScrollLeft, prev + delta));
      }
    },
    [rows.length, height, maxScrollLeft],
  );

  const startIdx = Math.max(0, Math.min(scrollTop, rows.length - height));
  const visibleRows = rows.slice(startIdx, startIdx + height);

  const handleRowMouseDown = useCallback(
    (realIdx: number) => () => {
      handleRowClick(realIdx);
    },
    [handleRowClick],
  );

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      onMouseScroll={handleMouseScroll}
    >
      {visibleRows.map((row, i) => {
        const realIdx = startIdx + i;
        const isSelected = realIdx === selectedIndex;
        const segs = rowSegments(
          row,
          collapsedDirs,
          commentCounts,
          viewedFiles,
        );
        const children = sliceSegments(segs, effectiveScrollLeft, width);

        if (isSelected) {
          // Pad to full width for highlight background
          const visibleLen = Math.min(
            segmentsLength(segs) - effectiveScrollLeft,
            width,
          );
          const pad = Math.max(0, width - visibleLen);
          return (
            <text
              key={row.node.path}
              width={width}
              selectable={false}
              bg={COLORS.selected}
              color="white"
              bold
              onMouseDown={handleRowMouseDown(realIdx)}
            >
              {children}
              {pad > 0 ? " ".repeat(pad) : null}
            </text>
          );
        }

        return (
          <text
            key={row.node.path}
            width={width}
            selectable={false}
            onMouseDown={handleRowMouseDown(realIdx)}
          >
            {children}
          </text>
        );
      })}
    </box>
  );
}
