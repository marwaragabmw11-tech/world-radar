import {createHash} from "node:crypto";

export function normalizeHeadline(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function articleFingerprint(input: {
  canonicalUrl: string;
  title: string;
}): string {
  const normalizedUrl = input.canonicalUrl.trim().replace(/#.*$/, "");
  const normalizedTitle = normalizeHeadline(input.title);
  return createHash("sha256")
    .update(`${normalizedUrl}\\n${normalizedTitle}`)
    .digest("hex");
}
