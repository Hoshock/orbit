import { useTerminalDimensions } from "@opentui/react";
import { COLORS, STATUS_ICONS } from "../constants.ts";
import type { CrevDiffFile, ReviewComment } from "../types.ts";

interface FileListProps {
  files: CrevDiffFile[];
  selectedIndex: number;
  comments: ReviewComment[];
  viewedFiles: Set<string>;
}

export function FileList({
  files,
  selectedIndex,
  comments,
  viewedFiles,
}: FileListProps) {
  const { width, height } = useTerminalDimensions();
  const listHeight = height - 2; // header + help bar

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
        const statusColor = COLORS[file.status] ?? "white";

        const commentStr = count > 0 ? `  ${count}` : "";
        const viewedMark = viewed ? " " : "";
        const prefix = isSelected ? " > " : "   ";

        return (
          <text
            key={file.path}
            width={width}
            backgroundColor={isSelected ? COLORS.selected : undefined}
            bold={isSelected}
          >
            {prefix}
            <text color={statusColor}>{icon}</text>
            {"  "}
            {file.path}
            {"  "}
            <text color={COLORS.addition}>+{file.additions}</text>{" "}
            <text color={COLORS.deletion}>-{file.deletions}</text>
            {commentStr && <text color={COLORS.comment}>{commentStr}</text>}
            {viewedMark}
          </text>
        );
      })}
    </box>
  );
}
