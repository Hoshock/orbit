import { COLORS } from "../constants.ts";
import type { ReviewComment } from "../types.ts";

interface CommentPanelProps {
  comments: ReviewComment[];
  width: number;
}

export function CommentPanel({ comments, width }: CommentPanelProps) {
  if (comments.length === 0) return null;

  return (
    <box flexDirection="column" width={width}>
      <text color={COLORS.headerDim} width={width}>
        {" --- comments ---"}
      </text>
      {comments.map((c) => {
        const lineStr =
          typeof c.position.line === "number"
            ? `L${c.position.line}`
            : `L${c.position.line.start}-${c.position.line.end}`;
        const resolved = c.resolved ? " [resolved]" : "";
        return (
          <text key={c.id} color={COLORS.comment} width={width}>
            {`  ${lineStr} (${c.position.side}): ${c.body.split("\n")[0]}${resolved}`}
          </text>
        );
      })}
    </box>
  );
}
