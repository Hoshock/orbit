import { useTerminalDimensions } from "@opentui/react";
import { COLORS } from "../constants.ts";

interface CommentFormProps {
  filePath: string;
  line: number;
  side: "old" | "new";
  codeLine?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  onEditorOpen: () => void;
  initialBody?: string;
}

export function CommentForm({
  filePath,
  line,
  side,
  codeLine,
  onSubmit,
  onCancel,
  onEditorOpen,
  initialBody,
}: CommentFormProps) {
  const { width, height } = useTerminalDimensions();

  return (
    <box flexDirection="column" flexGrow={1}>
      <text color={COLORS.header} bold width={width}>
        {` Comment on ${filePath}:L${line} (${side})`}
      </text>
      {codeLine && (
        <text color={COLORS.headerDim} width={width}>
          {`  > ${codeLine}`}
        </text>
      )}
      <box height={1} />
      <textarea
        focused={true}
        width={width - 4}
        height={Math.max(5, height - 8)}
        defaultValue={initialBody ?? ""}
        onSubmit={(value: string) => {
          const trimmed = value.trim();
          if (trimmed) onSubmit(trimmed);
        }}
        onCancel={onCancel}
      />
    </box>
  );
}
