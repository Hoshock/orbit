import { getTreeSitterClient } from "@opentui/core";
import { useEffect, useMemo, useRef } from "react";
import { COLORS } from "../constants.ts";
import { collapseDiff } from "../data/diff-collapse.ts";
import {
  sourceLineToDisplayLine,
  sourceLineToDisplayLineSplit,
} from "../data/diff-parser.ts";
import { syntaxStyle } from "../theme.ts";
import type { DiffFile, ReviewComment } from "../types.ts";
import { getFiletype } from "../utils/filetype.ts";
import {
  type DiffSyntaxRuntime,
  installProjectedDiffSyntaxHighlighting,
} from "./diff-syntax-highlighting.ts";

interface DiffPreviewProps {
  file: DiffFile | null;
  comments: ReviewComment[];
  splitMode: boolean;
  width: number;
  height: number;
  expandedFolds?: Map<number, number>;
}

type LineColorTarget = {
  setLineColor: (line: number, color: string) => void;
};

type DiffRuntime = DiffSyntaxRuntime & {
  leftSide?: LineColorTarget;
  rightSide?: LineColorTarget;
};

export function DiffPreview({
  file,
  comments,
  splitMode,
  width,
  height,
  expandedFolds,
}: DiffPreviewProps) {
  const diffRef = useRef<DiffRuntime | null>(null);
  const highlightDiffsRef = useRef({
    fullDiff: "",
    visibleDiff: "",
  });
  const treeSitterClient = useMemo(
    () =>
      process.env.ORBIT_DISABLE_TREESITTER === "1"
        ? undefined
        : getTreeSitterClient(),
    [],
  );
  const rawFiletype = useMemo(
    () => (file ? getFiletype(file.path) : undefined),
    [file],
  );
  const markerWidth = splitMode ? Math.floor(width / 2) : width;
  const collapsedDiff = useMemo(
    () =>
      file
        ? collapseDiff(file.rawDiff, expandedFolds ?? new Map(), markerWidth)
            .diff
        : "",
    [file?.rawDiff, file, expandedFolds, markerWidth],
  );
  highlightDiffsRef.current = {
    fullDiff: file?.rawDiff ?? "",
    visibleDiff: collapsedDiff,
  };
  const fileComments = useMemo(
    () => (file ? comments.filter((c) => c.filePath === file.path) : []),
    [comments, file?.path, file],
  );

  useEffect(() => {
    return installProjectedDiffSyntaxHighlighting({
      diff: diffRef.current,
      splitMode,
      rawFiletype,
      treeSitterClient,
      highlightDiffsRef,
    });
  }, [splitMode, rawFiletype, treeSitterClient]);

  useEffect(() => {
    if (!file) return;
    const diff = diffRef.current;
    if (!diff) return;

    if (typeof diff.buildView === "function") {
      diff.buildView();
      if ("pendingRebuild" in diff) diff.pendingRebuild = false;
    }

    const toDisplayLine = splitMode
      ? sourceLineToDisplayLineSplit
      : sourceLineToDisplayLine;
    const setColor = (line: number, side: "old" | "new") => {
      const displayLine = toDisplayLine(collapsedDiff, line, side);
      if (!displayLine) return;
      if (!splitMode) {
        diff.setLineColor(displayLine - 1, COLORS.commentHighlight);
        return;
      }
      if (side === "old") {
        diff.leftSide?.setLineColor(displayLine - 1, COLORS.commentHighlight);
      } else {
        diff.rightSide?.setLineColor(displayLine - 1, COLORS.commentHighlight);
      }
    };

    for (const c of fileComments) {
      if (typeof c.position.line === "number") {
        if (c.position.line > 0) setColor(c.position.line, c.position.side);
      } else {
        for (
          let line = c.position.line.start;
          line <= c.position.line.end;
          line++
        ) {
          setColor(line, c.position.side);
        }
      }
    }
  }, [file, fileComments, splitMode, collapsedDiff]);

  if (!file) {
    return (
      <box width={width} height={height} flexDirection="column">
        <text color={COLORS.headerDim} width={width}>
          {"  No file selected"}
        </text>
      </box>
    );
  }

  const statusChar = file.status[0]?.toUpperCase() ?? "?";
  const header = ` ${file.path} [${statusChar}] +${file.additions}/-${file.deletions}`;

  return (
    <box flexDirection="column" width={width} height={height}>
      <text color={COLORS.headerDim} width={width}>
        {header}
      </text>
      <scrollbox height={height - 1} width={width}>
        <diff
          ref={diffRef}
          diff={collapsedDiff}
          view={splitMode ? "split" : "unified"}
          wrapMode="none"
          width={width}
          syntaxStyle={syntaxStyle}
          filetype={rawFiletype}
          treeSitterClient={treeSitterClient}
        />
      </scrollbox>
    </box>
  );
}
