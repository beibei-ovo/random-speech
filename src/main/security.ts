import { resolve, relative, isAbsolute } from "node:path";
export function localAsset(root: string, pathname: string) {
  const decoded = decodeURIComponent(pathname);
  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    decoded.split("/").includes("..")
  )
    throw new Error("Invalid path");
  const file = resolve(root, "." + (decoded === "/" ? "/index.html" : decoded));
  const rel = relative(root, file);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Invalid path");
  return file;
}
export function audioRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error("Invalid range");
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || start < 0 || start > end || start >= size)
    throw new Error("Invalid range");
  return { start, end };
}
