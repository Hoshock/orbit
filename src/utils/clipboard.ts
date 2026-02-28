export function copyToClipboard(text: string): boolean {
  try {
    Bun.spawnSync(["pbcopy"], {
      stdin: new Response(text).body as ReadableStream,
    });
    return true;
  } catch {
    return false;
  }
}
