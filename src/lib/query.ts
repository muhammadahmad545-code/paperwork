/** Every word becomes a prefix match, quoted so user input can never form FTS syntax. */
export function ftsQuery(search: string): string | null {
  const words = search
    .split(/\s+/)
    .map((w) => w.replace(/[^0-9A-Za-z\u00C0-\uFFFF]/g, ''))
    .filter(Boolean);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}
