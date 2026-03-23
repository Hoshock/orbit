import type { MouseEvent } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useRef } from "react";
import type { DiffFile, ReviewComment } from "../types.ts";
import type { FlatTreeRow } from "../utils/file-tree.ts";
import { DiffPreview } from "./diff-preview.tsx";
import { FileTree } from "./file-tree.tsx";

const MIN_TREE_PCT = 0.1;
const MAX_TREE_PCT = 0.5;

interface HomeScreenProps {
  rows: FlatTreeRow[];
  selectedIndex: number;
  comments: ReviewComment[];
  viewedFiles: Set<string>;
  collapsedDirs: Set<string>;
  previewSplitMode: boolean;
  treePercent: number;
  expandedFolds: Map<string, Map<number, number>>;
  onTreeResize: (percent: number) => void;
  onSelectRow: (index: number) => void;
  onOpenFile: (index: number) => void;
}

export function HomeScreen({
  rows,
  selectedIndex,
  comments,
  viewedFiles,
  collapsedDirs,
  previewSplitMode,
  treePercent,
  expandedFolds,
  onTreeResize,
  onSelectRow,
  onOpenFile,
}: HomeScreenProps) {
  const { width, height } = useTerminalDimensions();
  const panelHeight = height - 2; // header + help bar

  const dividerWidth = 1;
  const availableWidth = width - dividerWidth;
  const clampedPct = Math.max(
    MIN_TREE_PCT,
    Math.min(MAX_TREE_PCT, treePercent),
  );
  const treeWidth = Math.max(Math.floor(availableWidth * clampedPct), 20);
  const previewWidth = availableWidth - treeWidth;

  // Keep last previewed file when cursor is on a directory
  const lastFileRef = useRef<DiffFile | null>(null);
  const selectedRow = rows[selectedIndex];
  const selectedFile = selectedRow?.node.file ?? null;
  if (selectedFile) lastFileRef.current = selectedFile;
  const previewFile = selectedFile ?? lastFileRef.current;

  // Track whether the drag started near the divider
  const draggingDividerRef = useRef(false);

  return (
    <box
      flexDirection="row"
      flexGrow={1}
      onMouseDown={(event: MouseEvent) => {
        draggingDividerRef.current = Math.abs(event.x - treeWidth) <= 2;
      }}
      onMouseDrag={(event: MouseEvent) => {
        if (!draggingDividerRef.current) return;
        const pct = event.x / availableWidth;
        onTreeResize(Math.max(MIN_TREE_PCT, Math.min(MAX_TREE_PCT, pct)));
      }}
      onMouseUp={() => {
        draggingDividerRef.current = false;
      }}
    >
      <FileTree
        rows={rows}
        selectedIndex={selectedIndex}
        comments={comments}
        viewedFiles={viewedFiles}
        collapsedDirs={collapsedDirs}
        width={treeWidth}
        height={panelHeight}
        onSelectRow={onSelectRow}
        onOpenFile={onOpenFile}
      />
      <box width={dividerWidth} height={panelHeight}>
        <text color="gray" height={panelHeight} width={dividerWidth}>
          {"\u2502".repeat(panelHeight)}
        </text>
      </box>
      <DiffPreview
        file={previewFile}
        comments={comments}
        splitMode={previewSplitMode}
        width={previewWidth}
        height={panelHeight}
        expandedFolds={
          previewFile ? expandedFolds.get(previewFile.path) : undefined
        }
      />
    </box>
  );
}
