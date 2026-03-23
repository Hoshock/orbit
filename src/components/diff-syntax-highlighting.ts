import type {
  CodeRenderable,
  DiffRenderable,
  TreeSitterClient,
} from "@opentui/core";
import {
  buildSplitProjectedHighlights,
  buildUnifiedProjectedHighlights,
} from "../utils/diff-syntax.ts";

export type DiffSyntaxLineColorTarget = {
  setLineColor: (line: number, color: unknown) => void;
  clearLineColor?: (line: number) => void;
};

export type DiffSyntaxRuntime = DiffRenderable & {
  buildView?: () => void;
  pendingRebuild?: boolean;
  leftSide?: DiffSyntaxLineColorTarget;
  rightSide?: DiffSyntaxLineColorTarget;
  leftCodeRenderable?: CodeRenderable & {
    onHighlight?: (
      highlights: unknown[],
      context: { content: string; filetype: string },
    ) => Promise<unknown[]> | unknown[];
  };
  rightCodeRenderable?: CodeRenderable & {
    onHighlight?: (
      highlights: unknown[],
      context: { content: string; filetype: string },
    ) => Promise<unknown[]> | unknown[];
  };
};

interface InstallProjectedDiffSyntaxHighlightingParams {
  diff: DiffSyntaxRuntime | null;
  splitMode: boolean;
  rawFiletype?: string;
  treeSitterClient?: Pick<TreeSitterClient, "highlightOnce">;
  highlightDiffsRef: {
    current: {
      fullDiff: string;
      visibleDiff: string;
    };
  };
}

export function installProjectedDiffSyntaxHighlighting({
  diff,
  splitMode,
  rawFiletype,
  treeSitterClient,
  highlightDiffsRef,
}: InstallProjectedDiffSyntaxHighlightingParams): (() => void) | undefined {
  if (!diff?.leftCodeRenderable || !rawFiletype || !treeSitterClient) return;

  if (splitMode) {
    diff.leftCodeRenderable.onHighlight = async (_highlights, context) =>
      buildSplitProjectedHighlights(
        highlightDiffsRef.current.fullDiff,
        highlightDiffsRef.current.visibleDiff,
        context.filetype,
        "left",
        treeSitterClient,
      );
    if (diff.rightCodeRenderable) {
      diff.rightCodeRenderable.onHighlight = async (_highlights, context) =>
        buildSplitProjectedHighlights(
          highlightDiffsRef.current.fullDiff,
          highlightDiffsRef.current.visibleDiff,
          context.filetype,
          "right",
          treeSitterClient,
        );
    }
  } else {
    diff.leftCodeRenderable.onHighlight = async (_highlights, context) =>
      buildUnifiedProjectedHighlights(
        highlightDiffsRef.current.fullDiff,
        highlightDiffsRef.current.visibleDiff,
        context.filetype,
        treeSitterClient,
      );
  }

  if (typeof diff.buildView === "function") {
    diff.buildView();
    if ("pendingRebuild" in diff) diff.pendingRebuild = false;
  }

  return () => {
    if (diff.leftCodeRenderable) {
      diff.leftCodeRenderable.onHighlight = undefined;
    }
    if (diff.rightCodeRenderable) {
      diff.rightCodeRenderable.onHighlight = undefined;
    }
  };
}
