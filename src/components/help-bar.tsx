import { useTerminalDimensions } from "@opentui/react";
import { COLORS } from "../constants.ts";
import { DEFAULT_ORBIT_KEYBINDINGS } from "../data/persistence.ts";
import type { AppMode, OrbitKeybindings } from "../types.ts";

interface HelpBarProps {
  mode: AppMode;
  flash?: string;
  splitMode?: boolean;
  keybindings?: OrbitKeybindings;
}

function displayKey(key: string): string {
  if (key === " ") return "Space";
  return key;
}

function displayShiftKey(key: string): string {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  return `Shift+${displayKey(key)}`;
}

export function HelpBar({ mode, flash, splitMode, keybindings }: HelpBarProps) {
  const { width } = useTerminalDimensions();
  const k = keybindings ?? DEFAULT_ORBIT_KEYBINDINGS;
  const fileTree = k.fileTree;
  const diffView = k.diffView;
  const commentList = k.commentList;
  const promptPreview = k.promptPreview;
  const foldStepKey = displayKey(diffView.fold);
  const foldAllKey = displayShiftKey(diffView.fold);
  const resizeKeys =
    fileTree.treeShrink === "[" && fileTree.treeGrow === "]"
      ? "[]"
      : `${displayKey(fileTree.treeShrink)}/${displayKey(fileTree.treeGrow)}`;

  if (flash) {
    return (
      <text color={COLORS.flash} width={width}>
        {` ${flash}`}
      </text>
    );
  }

  let helpText: string;
  if (mode === "file-list") {
    helpText = splitMode
      ? `Esc/${displayKey(fileTree.quit)}:quit  \u2191\u2193:move  \u2190\u2192:open/close  ${resizeKeys}:resize  Enter:diff  ${displayKey(fileTree.commentList)}:comment-list  ${displayKey(fileTree.promptPreview)}:prompt-preview  ${displayKey(fileTree.toggleViewMode)}:unified  ${displayKey(fileTree.toggleViewed)}:viewed`
      : `Esc/${displayKey(fileTree.quit)}:quit  \u2191\u2193:move  \u2190\u2192:open/close  ${resizeKeys}:resize  Enter:diff  ${displayKey(fileTree.commentList)}:comment-list  ${displayKey(fileTree.promptPreview)}:prompt-preview  ${displayKey(fileTree.toggleViewMode)}:split  ${displayKey(fileTree.toggleViewed)}:viewed`;
  } else if (mode === "diff-view") {
    helpText = splitMode
      ? `Esc/${displayKey(diffView.quit)}:back  \u2191\u2193:line  \u2190\u2192:side  Shift+\u2191\u2193:select  ${displayKey(diffView.comment)}:comment  ${displayKey(diffView.deleteComment)}:delete-comment  ${displayKey(diffView.editComment)}:edit-comment  ${displayKey(diffView.fileComment)}:file-comment  ${displayKey(diffView.toggleViewMode)}:unified  ${displayKey(diffView.toggleViewed)}:viewed  ${foldStepKey}:fold-step  ${foldAllKey}:fold-all`
      : `Esc/${displayKey(diffView.quit)}:back  \u2191\u2193:line  Shift+\u2191\u2193:select  ${displayKey(diffView.comment)}:comment  ${displayKey(diffView.deleteComment)}:delete-comment  ${displayKey(diffView.editComment)}:edit-comment  ${displayKey(diffView.fileComment)}:file-comment  ${displayKey(diffView.toggleViewMode)}:split  ${displayKey(diffView.toggleViewed)}:viewed  ${foldStepKey}:fold-step  ${foldAllKey}:fold-all`;
  } else if (mode === "comment-input") {
    helpText = "Esc:cancel  Ctrl+Enter:submit";
  } else if (mode === "comment-list") {
    helpText = `Esc/${displayKey(commentList.quit)}:back  \u2191\u2193:move  Enter:jump  ${displayKey(commentList.deleteComment)}:delete  ${displayKey(commentList.editComment)}:edit`;
  } else {
    // prompt-preview
    helpText = `Esc/${displayKey(promptPreview.quit)}:back  ${displayKey(promptPreview.copyPrompt)}:copy`;
  }

  return (
    <text color={COLORS.helpText} width={width}>
      {` ${helpText}`}
    </text>
  );
}
