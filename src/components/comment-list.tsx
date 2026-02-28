import { useTerminalDimensions } from "@opentui/react";
import { COLORS } from "../constants.ts";
import type { ReviewComment } from "../types.ts";

interface CommentListProps {
  comments: ReviewComment[];
  selectedIndex: number;
  onSelectComment?: (index: number) => void;
}

export function CommentList({
  comments,
  selectedIndex,
  onSelectComment,
}: CommentListProps) {
  const { width, height } = useTerminalDimensions();
  const listHeight = height - 2;

  if (comments.length === 0) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <text color={COLORS.headerDim} width={width}>
          {"  No comments yet. Press Esc to go back."}
        </text>
      </box>
    );
  }

  const startIdx = Math.max(0, selectedIndex - listHeight + 1);
  const visible = comments.slice(startIdx, startIdx + listHeight);

  return (
    <box flexDirection="column" flexGrow={1}>
      {visible.map((c, i) => {
        const realIdx = startIdx + i;
        const isSelected = realIdx === selectedIndex;
        const lineStr =
          typeof c.position.line === "number"
            ? `L${String(c.position.line)}`
            : `L${String(c.position.line.start)}-${String(c.position.line.end)}`;
        const sideStr = c.position.side === "old" ? "(old)" : "";
        const resolved = c.resolved ? " [resolved]" : "";
        const prefix = isSelected ? " > " : "   ";
        const firstLine = c.body.split("\n")[0] ?? "";

        const line = `${prefix}${c.filePath}:${lineStr}${sideStr}  ${firstLine}${resolved}`;

        return (
          <text
            key={c.id}
            width={width}
            backgroundColor={isSelected ? COLORS.selected : undefined}
            bold={isSelected}
            onMouseDown={() => onSelectComment?.(realIdx)}
          >
            {line}
          </text>
        );
      })}
    </box>
  );
}
