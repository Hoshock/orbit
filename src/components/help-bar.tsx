import { useTerminalDimensions } from "@opentui/react";
import { COLORS } from "../constants.ts";
import type { AppMode } from "../types.ts";

interface HelpBarProps {
  mode: AppMode;
  flash?: string;
}

const HELP_TEXTS: Record<AppMode, string> = {
  "file-list":
    "j/k:move  Enter:diff  Space:viewed  C:comments  P:prompt  t:split/unified  q:quit",
  "diff-view":
    "j/k:line  c:comment  n/N:next/prev comment  Tab:next file  t:split/unified  Esc:back",
  "comment-input": "Ctrl+Enter:submit  Esc:cancel  Ctrl+E:$EDITOR",
  "comment-list":
    "j/k:move  Enter:jump  e:edit  d:delete  y:copy  Y:copy all  Esc:back",
  "prompt-preview": "j/k:scroll  y:copy  Esc:back",
};

export function HelpBar({ mode, flash }: HelpBarProps) {
  const { width } = useTerminalDimensions();

  if (flash) {
    return (
      <text color={COLORS.flash} width={width}>
        {` ${flash}`}
      </text>
    );
  }

  return (
    <text color={COLORS.helpText} width={width}>
      {` ${HELP_TEXTS[mode]}`}
    </text>
  );
}
