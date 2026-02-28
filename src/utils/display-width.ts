function charWidth(code: number): number {
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3040 && code <= 0x33bf) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd)
  ) {
    return 2;
  }
  return 1;
}

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += charWidth(ch.codePointAt(0) ?? 0);
  }
  return w;
}

function sliceByWidth(
  s: string,
  maxWidth: number,
): { text: string; cols: number } {
  let cols = 0;
  let byteIdx = 0;
  for (const ch of s) {
    const w = charWidth(ch.codePointAt(0) ?? 0);
    if (cols + w > maxWidth) break;
    cols += w;
    byteIdx += ch.length;
  }
  return { text: s.slice(0, byteIdx), cols };
}

function wrapByWidth(s: string, lineWidth: number): string {
  const lines: string[] = [];
  let line = "";
  let lineW = 0;

  for (const ch of s) {
    const w = charWidth(ch.codePointAt(0) ?? 0);
    if (lineW + w > lineWidth) {
      lines.push(line);
      line = ch;
      lineW = w;
    } else {
      line += ch;
      lineW += w;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export function fitText(
  s: string,
  lineWidth: number,
  maxLines: number,
): string {
  const wrapped = wrapByWidth(s, lineWidth);
  const lines = wrapped.split("\n");

  if (lines.length <= maxLines) {
    return wrapped;
  }

  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1]!;
  const { text } = sliceByWidth(last, lineWidth - 3);
  kept[maxLines - 1] = `${text}...`;
  return kept.join("\n");
}
