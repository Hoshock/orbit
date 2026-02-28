import { SyntaxStyle } from "@opentui/core";
import type { ThemeTokenStyle } from "@opentui/core/syntax-style";

// GitHub Dark Dimmed — based on primer/primitives dark_dimmed scale
const THEME: ThemeTokenStyle[] = [
  { scope: ["comment"], style: { foreground: "#768390" } },
  { scope: ["string"], style: { foreground: "#96d0ff" } },
  {
    scope: ["number", "constant", "constant.builtin", "boolean"],
    style: { foreground: "#6cb6ff" },
  },
  {
    scope: ["keyword", "operator", "keyword.operator"],
    style: { foreground: "#f47067" },
  },
  {
    scope: ["function", "function.call", "function.method"],
    style: { foreground: "#dcbdfb" },
  },
  {
    scope: ["function.builtin"],
    style: { foreground: "#6cb6ff" },
  },
  {
    scope: ["type", "type.builtin", "constructor"],
    style: { foreground: "#6cb6ff" },
  },
  { scope: ["variable"], style: { foreground: "#f69d50" } },
  { scope: ["variable.parameter"], style: { foreground: "#adbac7" } },
  {
    scope: ["variable.builtin", "variable.member"],
    style: { foreground: "#6cb6ff" },
  },
  { scope: ["punctuation"], style: { foreground: "#adbac7" } },
  {
    scope: ["escape", "string.escape", "string.special"],
    style: { foreground: "#8ddb8c" },
  },
  { scope: ["tag"], style: { foreground: "#8ddb8c" } },
  { scope: ["attribute"], style: { foreground: "#6cb6ff" } },
  { scope: ["label"], style: { foreground: "#6cb6ff" } },
  { scope: ["property"], style: { foreground: "#6cb6ff" } },
  { scope: ["namespace"], style: { foreground: "#f69d50" } },
  { scope: ["decorator"], style: { foreground: "#dcbdfb" } },
  { scope: ["embedded"], style: { foreground: "#adbac7" } },
];

export const syntaxStyle = SyntaxStyle.fromTheme(THEME);
