import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef } from "react";
import { COLORS } from "../constants.ts";
import type { CrevDiffFile, ReviewComment } from "../types.ts";

interface DiffViewProps {
  file: CrevDiffFile;
  cursorLine: number;
  comments: ReviewComment[];
  splitMode: boolean;
}

export function DiffView({
  file,
  cursorLine,
  comments,
  splitMode,
}: DiffViewProps) {
  const { width, height } = useTerminalDimensions();
  const diffRef = useRef<any>(null);
  const scrollRef = useRef<any>(null);

  // Filter comments for this file
  const fileComments = comments.filter((c) => c.filePath === file.path);

  // Highlight cursor line
  useEffect(() => {
    if (diffRef.current?.setLineColor) {
      // Clear previous highlights, set cursor line
      diffRef.current.setLineColor(cursorLine, "new", COLORS.cursorLine);
    }
  }, [cursorLine]);

  // Highlight comment lines
  useEffect(() => {
    if (diffRef.current?.highlightLines) {
      const lines: number[] = [];
      for (const c of fileComments) {
        if (typeof c.position.line === "number") {
          lines.push(c.position.line);
        } else {
          for (let i = c.position.line.start; i <= c.position.line.end; i++) {
            lines.push(i);
          }
        }
      }
      if (lines.length > 0) {
        diffRef.current.highlightLines(lines, COLORS.commentHighlight);
      }
    }
  }, [fileComments]);

  // Current line comments
  const currentComments = fileComments.filter((c) => {
    if (typeof c.position.line === "number")
      return c.position.line === cursorLine;
    return (
      cursorLine >= c.position.line.start && cursorLine <= c.position.line.end
    );
  });

  const commentPanelHeight =
    currentComments.length > 0
      ? Math.min(currentComments.length * 2 + 1, 8)
      : 0;
  const diffHeight = height - 2 - commentPanelHeight; // header + helpbar + comment panel

  return (
    <box flexDirection="column" flexGrow={1}>
      <scrollbox ref={scrollRef} height={diffHeight} width={width}>
        <diff
          ref={diffRef}
          diff={file.rawDiff}
          viewMode={splitMode ? "split" : "unified"}
          wrapMode="none"
          width={width}
        />
      </scrollbox>
      {currentComments.length > 0 && (
        <box flexDirection="column" height={commentPanelHeight} width={width}>
          <text color={COLORS.headerDim} width={width}>
            {" --- comments ---"}
          </text>
          {currentComments.map((c) => (
            <text key={c.id} color={COLORS.comment} width={width}>
              {`  L${typeof c.position.line === "number" ? c.position.line : `${c.position.line.start}-${c.position.line.end}`} (${c.position.side}): ${c.body.split("\n")[0]}`}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}
