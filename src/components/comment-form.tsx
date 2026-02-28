import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef } from "react";
import { COLORS } from "../constants.ts";

interface CommentFormProps {
  filePath: string;
  line: number;
  lineRange?: { start: number; end: number } | null;
  side: "old" | "new";
  codeLine?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  initialBody?: string;
  maxHeight?: number;
}

export function CommentForm({
  filePath,
  line,
  lineRange,
  side,
  codeLine,
  onSubmit,
  maxHeight,
  initialBody,
}: CommentFormProps) {
  const { width, height } = useTerminalDimensions();
  const textareaRef = useRef<any>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const availableHeight = maxHeight ?? height - 2;
  const headerLines = codeLine ? 2 : 1;
  const textareaHeight = Math.max(3, availableHeight - headerLines);

  // React binding ignores onSubmit for <textarea> (only handles <input>).
  // Bypass by setting the submit handler directly on the renderable via ref.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.onSubmit = () => {
      const text = ta.editBuffer?.getText?.() ?? "";
      const trimmed = text.trim();
      if (trimmed) onSubmitRef.current(trimmed);
    };
  }, []);

  const locationLabel =
    line === 0
      ? `${filePath} (file)`
      : lineRange
        ? `${filePath}:L${lineRange.start}-${lineRange.end} (${side})`
        : `${filePath}:L${String(line)} (${side})`;

  return (
    <box flexDirection="column" height={availableHeight}>
      <text color={COLORS.header} bold width={width}>
        {` ${locationLabel}`}
      </text>
      {codeLine ? (
        <text color={COLORS.headerDim} width={width}>
          {`  > ${codeLine}`}
        </text>
      ) : null}
      <textarea
        ref={textareaRef}
        focused={true}
        width={width - 4}
        height={textareaHeight}
        initialValue={initialBody ?? ""}
        keyBindings={[{ name: "return", ctrl: true, action: "submit" }]}
      />
    </box>
  );
}
