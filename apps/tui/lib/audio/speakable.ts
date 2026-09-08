// Turns the agent's markdown-flavored replies into plain text a TTS engine
// can read aloud: formatting markers, links, code, and emoji are stripped or
// reduced to their readable part.

export function toSpeakable(markdown: string): string {
  return (
    markdown
      // fenced code blocks go entirely — reading code aloud is noise
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      // [text](url) and bare urls
      .replace(/\[([^[\]]*)\]\(([^()]*)\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      // emphasis and strikethrough markers around words — matched one marker at a time (rather than a single alternation-with-backreference pattern) to avoid catastrophic backtracking on pathological input
      .replace(/\*\*([^*]+?)\*\*/g, "$1")
      .replace(/__([^_]+?)__/g, "$1")
      .replace(/~~([^~]+?)~~/g, "$1")
      .replace(/\*([^*]+?)\*/g, "$1")
      .replace(/_([^_]+?)_/g, "$1")
      // heading/blockquote/list prefixes at line starts
      .replace(/^[ \t]*(#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+)/gm, "")
      // emoji and pictographs
      .replace(/(\p{Extended_Pictographic}|\u{FE0F}|\u{200D})/gu, "")
      .replace(/\s+/g, " ")
      .trim()
  )
}
