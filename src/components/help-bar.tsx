import { useTerminalDimensions } from "@opentui/react";
import { COLORS } from "../constants.ts";
import type { AppMode } from "../types.ts";

interface HelpBarProps {
  mode: AppMode;
  flash?: string;
  splitMode?: boolean;
}

export function HelpBar({ mode, flash, splitMode }: HelpBarProps) {
  const { width } = useTerminalDimensions();

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
      ? "Esc/q:quit  \u2191\u2193:move  \u2190\u2192:open/close  []:resize  Enter:diff  c:comments  p:prompt  t:unified  v:viewed"
      : "Esc/q:quit  \u2191\u2193:move  \u2190\u2192:open/close  []:resize  Enter:diff  c:comments  p:prompt  t:split  v:viewed";
  } else if (mode === "diff-view") {
    helpText = splitMode
      ? "Esc/q:back  \u2191\u2193:line  \u2190\u2192:side  Shift+\u2191\u2193:select  c:comment  d:delete  e:edit  f:file  t:unified  v:viewed  z:fold/unfold"
      : "Esc/q:back  \u2191\u2193:line  Shift+\u2191\u2193:select  c:comment  d:delete  e:edit  f:file  t:split  v:viewed  z:fold/unfold";
  } else if (mode === "comment-input") {
    helpText = "Esc:cancel  Ctrl+Enter:submit";
  } else if (mode === "comment-list") {
    helpText = "Esc/q:back  \u2191\u2193:move  Enter:jump  d:delete  e:edit";
  } else {
    // prompt-preview
    helpText = "Esc/q:back  y:copy";
  }

  return (
    <text color={COLORS.helpText} width={width}>
      {` ${helpText}`}
    </text>
  );
}
