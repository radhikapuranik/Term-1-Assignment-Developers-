const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
    if (g[0] === "#") {
      const code = g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED[g.toLowerCase()] ?? m;
  });
}

export function stripHtml(html: string): string {
  const noCode = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  const noTags = noCode.replace(/<\/(p|div|li|pre|h\d|br)>|<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

export function snippet(s: string | null | undefined, max = 400): string | null {
  if (!s) return null;
  const clean = stripHtml(s);
  return clean ? clean.slice(0, max) : null;
}
