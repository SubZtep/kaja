/** Strips the smallest indent found on the indented lines, then trims the ends: the renderer indents every block. */
export function dedent(text: string): string {
  const lines = text.split("\n")
  let indent = Infinity
  for (const line of lines) {
    const match = /^(\s+)\S/.exec(line)
    if (match) indent = Math.min(indent, match[1]!.length)
  }
  if (indent === Infinity) return text.trim()
  return lines
    .map(line => (line[0] === " " || line[0] === "\t" ? line.slice(indent) : line))
    .join("\n")
    .trim()
}
