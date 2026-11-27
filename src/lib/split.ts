/**
 * The problem page's Notes/Code split, stored in a cookie so the server renders the
 * saved sizes directly (no hydration mismatch, no layout jump on load).
 */
export type Split = { left: number; right: number };

export const SPLIT_COOKIE = "dsa-split";
export const DEFAULT_SPLIT: Split = { left: 45, right: 55 };

/** Parses the cookie value; anything malformed or out of range falls back to the default. */
export function parseSplit(raw: string | undefined | null): Split {
  if (!raw) return DEFAULT_SPLIT;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<Split>;
    const left = Number(v.left);
    const right = Number(v.right);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return DEFAULT_SPLIT;
    if (left < 20 || right < 20 || Math.abs(left + right - 100) > 1) return DEFAULT_SPLIT;
    return { left: Math.round(left * 10) / 10, right: Math.round(right * 10) / 10 };
  } catch {
    return DEFAULT_SPLIT;
  }
}

/** Client-side: remember the split for a year. */
export function saveSplit(split: Split) {
  const value = encodeURIComponent(JSON.stringify({ left: Math.round(split.left * 10) / 10, right: Math.round(split.right * 10) / 10 }));
  document.cookie = `${SPLIT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}
