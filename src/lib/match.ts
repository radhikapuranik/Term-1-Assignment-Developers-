function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * Case-insensitive match of `keyword` inside `text`. The keyword must not be glued to other
 * letters or digits on either side, so "CI" does not match "special", but terms that contain
 * punctuation such as "CI/CD" still work.
 */
export function keywordMatches(text: string, keyword: string): boolean {
  const kw = keyword.trim();
  if (!kw || !text) return false;
  const body = kw.split(/\s+/).map(escapeRegex).join("\\s+");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
  return re.test(text);
}
