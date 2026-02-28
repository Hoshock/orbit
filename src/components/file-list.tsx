import { useTerminalDimensions } from "@opentui/react";
import { useCallback, useRef } from "react";
import { COLORS, STATUS_ICONS } from "../constants.ts";
import type { DiffFile, ReviewComment } from "../types.ts";

interface FileListProps {
  files: DiffFile[];
  selectedIndex: number;
  comments: ReviewComment[];
  viewedFiles: Set<string>;
  onSelectFile?: (index: number) => void;
  onOpenFile?: (index: number) => void;
}

export function FileList({
  files,
  selectedIndex,
  comments,
  viewedFiles,
  onSelectFile,
  onOpenFile,
}: FileListProps) {
  const { width, height } = useTerminalDimensions();
  const listHeight = height - 2; // header + help bar
  const lastClickRef = useRef<{ index: number; time: number }>({
    index: -1,
    time: 0,
  });

  const handleRowClick = useCallback(
    (index: number) => {
      const now = Date.now();
      const last = lastClickRef.current;
      if (last.index === index && now - last.time < 400) {
        onOpenFile?.(index);
      } else {
        onSelectFile?.(index);
      }
      lastClickRef.current = { index, time: now };
    },
    [onSelectFile, onOpenFile],
  );

  // Count comments per file
  const commentCounts = new Map<string, number>();
  for (const c of comments) {
    commentCounts.set(c.filePath, (commentCounts.get(c.filePath) ?? 0) + 1);
  }

  // Viewport scrolling
  const startIdx = Math.max(0, selectedIndex - listHeight + 1);
  const visibleFiles = files.slice(startIdx, startIdx + listHeight);

  return (
    <box flexDirection="column" flexGrow={1}>
      {visibleFiles.map((file, i) => {
        const realIdx = startIdx + i;
        const isSelected = realIdx === selectedIndex;
        const viewed = viewedFiles.has(file.path);
        const count = commentCounts.get(file.path) ?? 0;
        const icon = STATUS_ICONS[file.status] ?? "?";
        const prefix = isSelected ? " > " : "   ";

        if (isSelected) {
          const stats = `+${String(file.additions)} -${String(file.deletions)}`;
          const commentSuffix = count > 0 ? `  ${String(count)}` : "";
          const viewedSuffix = viewed ? " \u2713" : "";
          return (
            <text
              key={file.path}
              width={width}
              bg={COLORS.selected}
              color="white"
              bold
              onMouseDown={() => handleRowClick(realIdx)}
            >
              {`${prefix}${icon}  ${file.path}  ${stats}${commentSuffix}${viewedSuffix}`}
            </text>
          );
        }

        return (
          <text
            key={file.path}
            width={width}
            onMouseDown={() => handleRowClick(realIdx)}
          >
            {`${prefix}${icon}  ${file.path}  `}
            <span fg={COLORS.addition}>{`+${String(file.additions)}`}</span>{" "}
            <span fg={COLORS.deletion}>{`-${String(file.deletions)}`}</span>
            {count > 0 ? (
              <span fg={COLORS.comment}>{`  ${String(count)}`}</span>
            ) : null}
            {viewed ? " \u2713" : ""}
          </text>
        );
      })}
    </box>
  );
}
