export const COLORS = {
  // File status
  modified: "yellow",
  added: "green",
  deleted: "red",
  renamed: "cyan",

  // UI
  selected: "#264f78",
  header: "cyan",
  headerDim: "gray",
  comment: "#e0a050",
  commentHighlight: "#7a4a00",
  cursorLine: "#264f78",
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
