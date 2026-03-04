interface FoldKeyEvent {
  name?: string;
  raw?: string;
  shift?: boolean;
}

export function isKeybindingPressed(
  key: FoldKeyEvent,
  binding: string,
): boolean {
  const normalized = binding.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return (
    key.name?.toLowerCase() === normalized ||
    key.raw?.toLowerCase() === normalized
  );
}

export function isFoldAllRequested(
  key: FoldKeyEvent,
  foldBinding: string,
): boolean {
  if (!isKeybindingPressed(key, foldBinding)) return false;
  if (key.shift) return true;

  const normalized = foldBinding.trim().toLowerCase();
  const raw = key.raw ?? "";
  const isLetter = raw.toLowerCase() !== raw.toUpperCase();
  if (!isLetter) return false;
  return raw === raw.toUpperCase() && raw.toLowerCase() === normalized;
}

export function getExpandChunk(
  hiddenCount: number,
  prevRevealed: number,
  incrementalFoldLines: number,
  fullFoldRequested: boolean,
): number {
  if (fullFoldRequested) return Math.max(0, hiddenCount - prevRevealed);
  return Math.max(
    0,
    Math.min(incrementalFoldLines, hiddenCount - prevRevealed),
  );
}
