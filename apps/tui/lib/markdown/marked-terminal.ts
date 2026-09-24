// Vendored from marked-terminal@7.3.0 (https://github.com/mikaelbr/marked-terminal),
// MIT licensed, by Mikael Brevik. Vendored instead of depended on because the npm
// package's peerDependencies cap marked at "<16"; the source itself needs no changes
// to run against current marked (confirmed against marked@18 before vendoring).
//
// The upstream text() renderer read token.text (the raw, unparsed source) instead of
// recursing into token.tokens, so inline markdown - links, bold, ... - inside a
// single-line list item or table cell rendered as literal source instead of being
// parsed. Its own link/del/heading renderers didn't have this bug. Fixed in place
// below (see Renderer.prototype.text) instead of patching it externally afterwards.
//
// A code block with no language is not highlighted (upstream guesses one; see highlight()).
//
// Trimmed from upstream: no :shortcode: emoji replacement (node-emoji), and Bun's
// stripANSI and a local OSC 8 link helper stand in for ansi-regex and ansi-escapes.
//
// Tables are drawn by ./table instead of cli-table3: rounded, one rule under the header, aligned, fit to a width.

import chalk from "chalk"
import { highlight as highlightCli } from "cli-highlight"
import supportsHyperlinks from "supports-hyperlinks"
import { renderTable } from "./table"

const COLON_REPLACER = "*#COLON|*"
const COLON_REPLACER_REGEXP = new RegExp(escapeRegExp(COLON_REPLACER), "g")

const TAB_ALLOWED_CHARACTERS = ["\t"]

// HARD_RETURN holds a character sequence used to indicate text has a
// hard (no-reflowing) line break.  Previously \r and \r\n were turned
// into \n in marked's lexer- preprocessing step. So \r is safe to use
// to indicate a hard (non-reflowed) return.
const HARD_RETURN = "\r"
const HARD_RETURN_RE = new RegExp(HARD_RETURN)
const HARD_RETURN_GFM_RE = new RegExp(`${HARD_RETURN}|<br />`)

const defaultOptions = {
  code: chalk.yellow,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.green.bold,
  firstHeading: chalk.magenta.underline.bold,
  hr: chalk.reset,
  listitem: chalk.reset,
  list,
  table: chalk.reset,
  paragraph: chalk.reset,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.yellow,
  del: chalk.dim.gray.strikethrough,
  link: chalk.blue,
  href: chalk.blue.underline,
  text: identity,
  unescape: true,
  width: 80,
  showSectionPrefix: true,
  reflowText: false,
  tab: 4,
  tableHead: chalk.bold,
  tableBorder: chalk.gray,
  // The most columns a table may take; read per table, so it can follow the terminal's width
  tableWidth: () => 80
}

function Renderer(this: any, options: any, highlightOptions: any) {
  this.o = { ...defaultOptions, ...options }
  this.tab = sanitizeTab(this.o.tab, defaultOptions.tab)
  this.unescape = this.o.unescape ? unescapeEntities : identity
  this.highlightOptions = highlightOptions || {}

  this.transform = compose(undoColon, this.unescape)
}

// Compute length of str not including ANSI escape codes.
// See http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
function textLength(str: string) {
  return Bun.stripANSI(str).length
}

;(Renderer.prototype as any).textLength = textLength

function fixHardReturn(text: string, reflow: boolean) {
  return reflow ? text.replace(HARD_RETURN, "\n") : text
}

;(Renderer.prototype as any).space = () => ""

// Recurses into token.tokens (when present) instead of using the raw,
// unparsed token.text, so inline markdown inside a single-line list item or
// table cell is actually parsed instead of rendered as literal source.
;(Renderer.prototype as any).text = function (this: any, text: any) {
  if (typeof text === "object") {
    if (text.tokens) return this.parser.parseInline(text.tokens)
    text = text.text
  }
  return this.o.text(text)
}

;(Renderer.prototype as any).code = function (this: any, code: any, lang: any, _escaped: any) {
  if (typeof code === "object") {
    lang = code.lang
    _escaped = !!code.escaped
    code = code.text
  }
  return section(indentify(this.tab, highlight(code, lang, this.o, this.highlightOptions)))
}

;(Renderer.prototype as any).blockquote = function (this: any, quote: any) {
  if (typeof quote === "object") {
    quote = this.parser.parse(quote.tokens)
  }
  return section(this.o.blockquote(indentify(this.tab, quote.trim())))
}

;(Renderer.prototype as any).html = function (this: any, html: any) {
  if (typeof html === "object") {
    html = html.text
  }
  return this.o.html(html)
}

;(Renderer.prototype as any).heading = function (this: any, text: any, level: any) {
  if (typeof text === "object") {
    level = text.depth
    text = this.parser.parseInline(text.tokens)
  }
  text = this.transform(text)

  const prefix = this.o.showSectionPrefix ? `${new Array(level + 1).join("#")} ` : ""
  text = prefix + text
  if (this.o.reflowText) {
    text = reflowText(text, this.o.width, this.options.gfm)
  }
  return section(level === 1 ? this.o.firstHeading(text) : this.o.heading(text))
}

;(Renderer.prototype as any).hr = function (this: any) {
  return section(this.o.hr(hr("-", this.o.reflowText && this.o.width)))
}

;(Renderer.prototype as any).list = function (this: any, body: any, ordered: any) {
  if (typeof body === "object") {
    const listToken = body
    ordered = listToken.ordered
    body = ""
    for (const item of listToken.items) {
      body += this.listitem(item)
    }
  }
  body = this.o.list(body, ordered, this.tab)
  return section(fixNestedLists(indentLines(this.tab, body), this.tab))
}

// Prefixes a loose task item's first paragraph (and its first text token, if
// any) with the checkbox instead of prepending to the whole rendered item.
function prependCheckboxToLooseItem(item: any, checkbox: string) {
  if (item.tokens.length > 0 && item.tokens[0].type === "paragraph") {
    item.tokens[0].text = `${checkbox} ${item.tokens[0].text}`
    if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
      item.tokens[0].tokens[0].text = `${checkbox} ${item.tokens[0].tokens[0].text}`
    }
  } else {
    item.tokens.unshift({
      type: "text",
      raw: `${checkbox} `,
      text: `${checkbox} `
    })
  }
}

;(Renderer.prototype as any).listitem = function (this: any, text: any) {
  if (typeof text === "object") {
    const item = text
    text = ""
    if (item.task) {
      const checkbox = this.checkbox({ checked: !!item.checked })
      if (item.loose) prependCheckboxToLooseItem(item, checkbox)
      else text += `${checkbox} `
    }

    text += this.parser.parse(item.tokens, !!item.loose)
  }
  const transform = compose(this.o.listitem, this.transform)
  const isNested = text.includes("\n")
  if (isNested) text = text.trim()

  // Use BULLET_POINT as a marker for ordered or unordered list item
  return `\n${BULLET_POINT}${transform(text)}`
}

;(Renderer.prototype as any).checkbox = function (this: any, checked: any) {
  if (typeof checked === "object") {
    checked = checked.checked
  }
  return `[${checked ? "X" : " "}] `
}

;(Renderer.prototype as any).paragraph = function (this: any, text: any) {
  if (typeof text === "object") {
    text = this.parser.parseInline(text.tokens)
  }
  const transform = compose(this.o.paragraph, this.transform)
  text = transform(text)
  if (this.o.reflowText) {
    text = reflowText(text, this.o.width, this.options.gfm)
  }
  return section(text)
}

;(Renderer.prototype as any).table = function (this: any, token: any) {
  const inline = (cell: any) => this.transform(this.parser.parseInline(cell.tokens))
  const table = renderTable({
    head: token.header.map(inline),
    rows: token.rows.map((row: any[]) => row.map(inline)),
    align: token.align,
    maxWidth: this.o.tableWidth(),
    headStyle: this.o.tableHead,
    borderStyle: this.o.tableBorder
  })
  return section(this.o.table(table))
}

// span level renderer
;(Renderer.prototype as any).strong = function (this: any, text: any) {
  if (typeof text === "object") {
    text = this.parser.parseInline(text.tokens)
  }
  return this.o.strong(text)
}

;(Renderer.prototype as any).em = function (this: any, text: any) {
  if (typeof text === "object") {
    text = this.parser.parseInline(text.tokens)
  }
  text = fixHardReturn(text, this.o.reflowText)
  return this.o.em(text)
}

;(Renderer.prototype as any).codespan = function (this: any, text: any) {
  if (typeof text === "object") {
    text = text.text
  }
  text = fixHardReturn(text, this.o.reflowText)
  return this.o.codespan(text.replaceAll(":", COLON_REPLACER))
}

;(Renderer.prototype as any).br = function (this: any) {
  return this.o.reflowText ? HARD_RETURN : "\n"
}

;(Renderer.prototype as any).del = function (this: any, text: any) {
  if (typeof text === "object") {
    text = this.parser.parseInline(text.tokens)
  }
  return this.o.del(text)
}

;(Renderer.prototype as any).link = function (this: any, href: any, _title: any, text: any) {
  if (typeof href === "object") {
    _title = href.title
    text = this.parser.parseInline(href.tokens)
    href = href.href
  }

  if (this.options.sanitize) {
    let prot: string
    try {
      prot = decodeURIComponent(unescape(href))
        .replace(/[^\w:]/g, "")
        .toLowerCase()
    } catch {
      return ""
    }
    if (prot.startsWith("javascript:") || prot.startsWith("data:") || prot.startsWith("vbscript:")) {
      return ""
    }
  }

  const hasText = text && text !== href

  let out = ""

  if (supportsHyperlinks.stdout) {
    let link = ""
    if (text) {
      link = this.o.href(text)
    } else {
      link = this.o.href(href)
    }
    out = terminalLink(
      link,
      // textLength breaks on '+' in URLs
      href.replaceAll("+", "%20")
    )
  } else {
    if (hasText) out += `${text} (`
    out += this.o.href(href)
    if (hasText) out += ")"
  }
  return this.o.link(out)
}

;(Renderer.prototype as any).image = function (this: any, href: any, title: any, text: any) {
  if (typeof href === "object") {
    title = href.title
    text = href.text
    href = href.href
  }

  if (typeof this.o.image === "function") {
    return this.o.image(href, title, text)
  }
  let out = `![${text}`
  if (title) out += ` – ${title}`
  return `${out}](${href})\n`
}

export default Renderer

export function markedTerminal(options?: any, highlightOptions?: any) {
  const r = new (Renderer as any)(options, highlightOptions)

  const funcs = [
    "text",
    "code",
    "blockquote",
    "html",
    "heading",
    "hr",
    "list",
    "listitem",
    "checkbox",
    "paragraph",
    "table",
    "strong",
    "em",
    "codespan",
    "br",
    "del",
    "link",
    "image"
  ]

  return funcs.reduce(
    (extension: any, func) => {
      extension.renderer[func] = function (this: any, ...args: any[]) {
        r.options = this.options
        r.parser = this.parser
        return r[func](...args)
      }
      return extension
    },
    { renderer: {} as Record<string, unknown>, useNewRenderer: true }
  )
}

type ReflowState = {
  column: number
  currentLine: string
  reflowed: string[]
}

// Word is longer than the remaining width: emit as many full-width lines as
// needed, then leave the remainder as the new current line.
function wrapOverflowingWord(state: ReflowState, word: string, width: number, addSpace: boolean) {
  let w = word.substring(0, width - state.column - (addSpace ? 1 : 0))
  if (addSpace) state.currentLine += " "
  state.currentLine += w
  state.reflowed.push(state.currentLine)
  state.currentLine = ""
  state.column = 0

  word = word.substring(w.length)
  while (word.length) {
    w = word.substring(0, width)
    if (!w.length) break

    if (w.length < width) {
      state.currentLine = w
      state.column = w.length
      break
    }
    state.reflowed.push(w)
    word = word.substring(width)
  }
}

function appendWord(state: ReflowState, word: string, width: number, addSpace: boolean) {
  if (state.column + word.length + (addSpace ? 1 : 0) > width) {
    if (word.length <= width) {
      // If the new word is smaller than the required width
      // just add it at the beginning of a new line
      state.reflowed.push(state.currentLine)
      state.currentLine = word
      state.column = word.length
    } else {
      wrapOverflowingWord(state, word, width, addSpace)
    }
  } else {
    if (addSpace) {
      state.currentLine += " "
      state.column++
    }
    state.currentLine += word
    state.column += word.length
  }
}

function reflowSection(section: string, width: number, state: ReflowState) {
  // Split the section by escape codes so that we can
  // deal with them separately. RegExp constructor (not a literal) so the \x1b
  // escape stays a string escape sequence instead of a raw control character.
  // biome-ignore lint/complexity/useRegexLiterals: literal form trips noControlCharactersInRegex on \x1b
  const fragments = section.split(new RegExp("(\\x1b\\[(?:\\d{1,3})(?:;\\d{1,3})*m)", "g"))
  let lastWasEscapeChar = false

  while (fragments.length) {
    const fragment = fragments[0]!

    if (fragment === "") {
      fragments.splice(0, 1)
      lastWasEscapeChar = false
      continue
    }

    // This is an escape code - leave it whole and
    // move to the next fragment.
    if (!textLength(fragment)) {
      state.currentLine += fragment
      fragments.splice(0, 1)
      lastWasEscapeChar = true
      continue
    }

    const words = fragment.split(/[ \t\n]+/)

    for (const word of words) {
      const addSpace = state.column !== 0 && !lastWasEscapeChar
      appendWord(state, word, width, addSpace)
      lastWasEscapeChar = false
    }

    fragments.splice(0, 1)
  }

  if (textLength(state.currentLine)) state.reflowed.push(state.currentLine)
}

// Munge \n's and spaces in "text" so that the number of
// characters between \n's is less than or equal to "width".
function reflowText(text: string, width: number, gfm: boolean) {
  // Hard break was inserted by Renderer.prototype.br or is
  // <br /> when gfm is true
  const splitRe = gfm ? HARD_RETURN_GFM_RE : HARD_RETURN_RE
  const sections = text.split(splitRe)
  const reflowed: string[] = []

  sections.forEach(section => {
    reflowSection(section, width, { column: 0, currentLine: "", reflowed })
  })

  return reflowed.join("\n")
}

function indentLines(indent: string, text: string) {
  return text.replace(/(^|\n)(.+)/g, `$1${indent}$2`)
}

function indentify(indent: string, text: string) {
  if (!text) return text
  return indent + text.split("\n").join(`\n${indent}`)
}

const BULLET_POINT_REGEX = String.raw`\*`
const NUMBERED_POINT_REGEX = String.raw`\d+\.`
const POINT_REGEX = `(?:${[BULLET_POINT_REGEX, NUMBERED_POINT_REGEX].join("|")})`

// Prevents nested lists from joining their parent list's last line
function fixNestedLists(body: string, indent: string) {
  const regex = new RegExp(
    `${
      String.raw`(\S(?: |  )?)` + // Last char of current point, plus one or two spaces
      // to allow trailing spaces
      "((?:"
    }${indent})+)(${POINT_REGEX}(?:.*)+)$`,
    "gm"
  ) // Body of subpoint
  return body.replace(regex, `$1\n${indent}$2$3`)
}

function isPointedLine(line: string, indent: string) {
  return new RegExp(`^(?:${indent})*${POINT_REGEX}`).exec(line)
}

function toSpaces(str: string) {
  return " ".repeat(str.length)
}

const BULLET_POINT = "* "
function bulletPointLine(indent: string, line: string) {
  return isPointedLine(line, indent) ? line : toSpaces(BULLET_POINT) + line
}

function bulletPointLines(lines: string, indent: string) {
  const transform = bulletPointLine.bind(null, indent)
  return lines.split("\n").filter(identity).map(transform).join("\n")
}

const numberedPoint = (n: number) => `${n}. `
function numberedLine(indent: string, line: string, num: number) {
  return isPointedLine(line, indent)
    ? {
        num: num + 1,
        line: line.replace(BULLET_POINT, numberedPoint(num + 1))
      }
    : {
        num,
        line: toSpaces(numberedPoint(num)) + line
      }
}

function numberedLines(lines: string, indent: string) {
  const transform = numberedLine.bind(null, indent)
  let num = 0
  return lines
    .split("\n")
    .filter(identity)
    .map(line => {
      const numbered = transform(line, num)
      num = numbered.num

      return numbered.line
    })
    .join("\n")
}

function list(body: string, ordered: boolean, indent: string) {
  body = body.trim()
  body = ordered ? numberedLines(body, indent) : bulletPointLines(body, indent)
  return body
}

function section(text: string) {
  return `${text}\n\n`
}

function highlight(code: string, language: string, opts: any, hightlightOpts: any) {
  if (chalk.level === 0) return code

  const style = opts.code

  code = fixHardReturn(code, opts.reflowText)

  // No language: cli-highlight would guess one, which costs ~17ms a block and is often wrong
  if (!language) return style(code)

  try {
    return highlightCli(code, { language, ...hightlightOpts })
  } catch {
    return style(code)
  }
}

/** An OSC 8 terminal hyperlink: `text` that opens `url` when clicked. */
function terminalLink(text: string, url: string) {
  return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`
}

function hr(inputHrStr: string, length: number) {
  length = length || process.stdout.columns
  return new Array(length).join(inputHrStr)
}

function undoColon(str: string) {
  return str.replace(COLON_REPLACER_REGEXP, ":")
}

function escapeRegExp(str: string) {
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, String.raw`\$&`)
}

const ENTITY_UNESCAPES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'"
}

// Single pass so an entity produced by one replacement (e.g. &amp;lt; -> &lt;)
// can't be re-matched and unescaped again by a later replacement in the chain.
function unescapeEntities(html: string) {
  return html.replace(/&(?:amp|lt|gt|quot|#39);/g, match => ENTITY_UNESCAPES[match]!)
}

function identity(str: string) {
  return str
}

function compose(...funcs: ((...args: any[]) => any)[]) {
  return function (this: any, ...args: any[]) {
    let result: any = args
    for (let i = funcs.length; i-- > 0; ) {
      result = [funcs[i]!.apply(this, result)]
    }
    return result[0]
  }
}

function isAllowedTabString(string: string) {
  return TAB_ALLOWED_CHARACTERS.some(char => new RegExp(`^(${char})+$`).exec(string))
}

function sanitizeTab(tab: string | number, fallbackTab: number) {
  if (typeof tab === "number") {
    return new Array(tab + 1).join(" ")
  } else if (typeof tab === "string" && isAllowedTabString(tab)) {
    return tab
  } else {
    return new Array(fallbackTab + 1).join(" ")
  }
}
