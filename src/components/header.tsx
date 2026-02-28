import { useTerminalDimensions } from "@opentui/react";
import { COLORS } from "../constants.ts";

interface HeaderProps {
  title: string;
  commentCount: number;
  extra?: string;
}

export function Header({ title, commentCount, extra }: HeaderProps) {
  const { width } = useTerminalDimensions();

  const left = ` crev: ${title}`;
  const right = commentCount > 0 ? `${commentCount} comments ` : "";
  const mid = extra ? `  ${extra}` : "";

  return (
    <text color={COLORS.header} bold width={width}>
      {left}
      {mid}
      {right ? `  ${right}` : ""}
    </text>
  );
}
