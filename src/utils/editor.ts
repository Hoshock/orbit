import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function openInEditor(initialContent: string): string | null {
  const editor = process.env.EDITOR || "vi";
  const tmpFile = join(tmpdir(), `crev-comment-${Date.now()}.md`);

  try {
    writeFileSync(tmpFile, initialContent);
    const result = Bun.spawnSync([editor, tmpFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    if (result.exitCode !== 0) return null;

    const content = readFileSync(tmpFile, "utf-8").trim();
    return content || null;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}
