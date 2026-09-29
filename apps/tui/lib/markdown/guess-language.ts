/** A cheap language guess for a code block that names none, or undefined to leave it plain (cli-highlight's own guessing costs ~17ms a block and is often wrong). */
export function guessLanguage(code: string): string | undefined {
  const text = code.trim()
  if (!text) return undefined
  if (
    /^#!.*\b(ba|z)?sh\b/.test(text) ||
    text.startsWith("$ ") ||
    /^(cat|cd|ls|echo|curl|git|bun|npm|sudo|mkdir) /m.test(text)
  )
    return "bash"
  if (
    /^import [\w., ]+$/m.test(text) ||
    /^from [\w.]+ import /m.test(text) ||
    /^def \w+\(/m.test(text) ||
    /^print\(/m.test(text)
  )
    return "python"
  if (/^(const|let|import|export|function|interface|type) /m.test(text) || /=>/.test(text)) return "typescript"
  if (/^[{[]/.test(text)) {
    try {
      JSON.parse(text)
      return "json"
    } catch {}
  }
  return undefined
}
