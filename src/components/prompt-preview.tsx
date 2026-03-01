import { useTerminalDimensions } from "@opentui/react";
import { COLORS } from "../constants.ts";
import { syntaxStyle } from "../theme.ts";

interface PromptPreviewProps {
  prompt: string;
  commentCount: number;
}

export function PromptPreview({ prompt, commentCount }: PromptPreviewProps) {
  const { width, height } = useTerminalDimensions();

  if (commentCount === 0) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <text color={COLORS.headerDim} width={width}>
          {"  No comments to generate prompt. Press Esc to go back."}
        </text>
      </box>
    );
  }

  return (
    <scrollbox height={height - 2} width={width}>
      <code
        content={prompt}
        filetype="markdown"
        syntaxStyle={syntaxStyle}
        width={width}
      />
    </scrollbox>
  );
}
