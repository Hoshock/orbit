import { SyntaxStyle } from "@opentui/core";
import type { ThemeTokenStyle } from "@opentui/core/syntax-style";

const THEME: ThemeTokenStyle[] = [
  { scope: ["comment"], style: { foreground: "#768390" } },
  { scope: ["string"], style: { foreground: "#57ab5a" } },
  {
    scope: ["number", "constant", "constant.builtin"],
    style: { foreground: "#f69d50" },
  },
  {
    scope: ["keyword", "operator", "keyword.operator"],
    style: { foreground: "#f47067" },
  },
  {
    scope: ["function", "function.call", "function.method"],
    style: { foreground: "#b083f0" },
  },
  {
    scope: ["type", "type.builtin", "constructor"],
    style: { foreground: "#539bf5" },
  },
  { scope: ["variable"], style: { foreground: "#adbac7" } },
  { scope: ["variable.parameter"], style: { foreground: "#f69d50" } },
  {
    scope: ["variable.builtin", "variable.member"],
    style: { foreground: "#f69d50" },
  },
  { scope: ["punctuation"], style: { foreground: "#adbac7" } },
  {
    scope: ["escape", "string.escape", "string.special"],
    style: { foreground: "#39c5cf" },
  },
  { scope: ["tag"], style: { foreground: "#57ab5a" } },
  { scope: ["attribute"], style: { foreground: "#539bf5" } },
  { scope: ["label"], style: { foreground: "#539bf5" } },
  { scope: ["property"], style: { foreground: "#539bf5" } },
  { scope: ["namespace"], style: { foreground: "#f69d50" } },
  { scope: ["boolean"], style: { foreground: "#f69d50" } },
];

export const syntaxStyle = SyntaxStyle.fromTheme(THEME);
