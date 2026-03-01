import { getTreeSitterClient } from "@opentui/core";
import { useMemo } from "react";
import { COLORS } from "../constants.ts";
import { collapseDiff } from "../data/diff-collapse.ts";
import { syntaxStyle } from "../theme.ts";
import type { DiffFile } from "../types.ts";
import { getFiletype } from "../utils/filetype.ts";

interface DiffPreviewProps {
  file: DiffFile | null;
  splitMode: boolean;
  width: number;
  height: number;
  expandedFolds?: Map<number, number>;
}

export function DiffPreview({
  file,
  splitMode,
  width,
  height,
  expandedFolds,
}: DiffPreviewProps) {
  const markerWidth = splitMode ? Math.floor(width / 2) : width;
  const collapsedDiff = useMemo(
    () =>
      file
        ? collapseDiff(file.rawDiff, expandedFolds ?? new Map(), markerWidth)
            .diff
        : "",
    [file?.rawDiff, file, expandedFolds, markerWidth],
  );

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
          diff={collapsedDiff}
          view={splitMode ? "split" : "unified"}
          wrapMode="none"
          width={width}
          syntaxStyle={syntaxStyle}
          filetype={getFiletype(file.path)}
          treeSitterClient={getTreeSitterClient()}
        />
      </scrollbox>
    </box>
  );
}
