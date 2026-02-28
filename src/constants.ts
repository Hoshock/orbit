export const COLORS = {
  // File status
  modified: "yellow",
  added: "green",
  deleted: "red",
  renamed: "cyan",

  // UI
  selected: "blue",
  header: "cyan",
  headerDim: "gray",
  comment: "magenta",
  commentHighlight: "#5c3566",
  cursorLine: "#1a3a5c",
  helpKey: "yellow",
  helpText: "gray",
  flash: "green",

  // Diff
  addition: "green",
  deletion: "red",
} as const;

export const STATUS_ICONS: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
};

export const GENERATED_PATTERNS = [
  /^bun\.lockb$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /^dist\//,
  /^build\//,
  /\.generated\./,
];
