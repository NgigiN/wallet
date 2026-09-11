export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

const RE = /^(android|web)\/(\d+\.\d+(?:\.\d+)?)$/;

export function parseClientHeader(v: string | undefined) {
  if (!v) return null;
  const m = RE.exec(v.trim());
  return m ? { platform: m[1] as "android" | "web", version: m[2] } : null;
}
