// Used by locales.ts: catches a translation written in the wrong language, which the {params} check can't see.

const HANGUL = /[가-힣]/
const KANA = /[぀-ヿ]/
const NON_LATIN = /[가-힣぀-ヿ一-鿿]/

/** The script a locale's translations must be in, when it isn't Latin. */
const SCRIPT_OF: Record<string, RegExp> = {
  "ko-KR": HANGUL,
  "ja-JP": /[぀-ヿ一-鿿]/,
  "zh-TW": /[一-鿿]/,
  "nan-TW": /[一-鿿]/
}

// Languages close enough to word a short technical phrase the same way
const RELATED = [new Set(["es-ES", "pt-BR"]), new Set(["zh-TW", "nan-TW"])]

// Below this many characters of prose two languages may well agree; past it, the same text is a copy
const COPY_MIN_LENGTH = 24

const isPlaceholder = (value: string, locale: string) => value.trimStart().startsWith(`[${locale}] lorem`)
const withoutParams = (value: string) => value.replace(/\{[^{}]+\}/g, "")

// A Latin word of 4+ letters that the English doesn't have: translated text, where only kept terms (Provider, Token) may stay
function hasForeignWord(english: string, value: string): boolean {
  const known = english.toLowerCase()
  const words = withoutParams(value).match(/[A-Za-zÀ-ÿ]{4,}/g) ?? []
  return words.some(word => !known.includes(word.toLowerCase().slice(0, 4)))
}

/**
 * Why `value` can't be `locale`'s translation of `english`, or undefined when it can: a Latin-script language with
 * Hangul, kana or Han in it, or a non-Latin one with words in neither its own script nor the English. Catches a file
 * written in another language, as when parallel translator agents overwrote each other's chunk files.
 */
export function wrongScript(locale: string, english: string, value: string): string | undefined {
  if (value === english || isPlaceholder(value, locale)) return undefined
  const script = SCRIPT_OF[locale]
  if (script)
    return script.test(value) || !hasForeignWord(english, value) ? undefined : `not written in ${locale}'s script`
  if (KANA.test(value) && !KANA.test(english)) return "has Japanese kana in it"
  if (HANGUL.test(value) && !HANGUL.test(english)) return "has Korean Hangul in it"
  if (NON_LATIN.test(value) && !NON_LATIN.test(english)) return "has Chinese characters in it"
  return undefined
}

// One key's translations long enough to compare, each mapped to the locales using it
function localesByValue(
  key: string,
  source: string,
  byLocale: Map<string, Map<string, string>>
): Map<string, string[]> {
  const seen = new Map<string, string[]>()
  for (const [locale, values] of byLocale) {
    const value = values.get(key)
    if (value === undefined || value === source || isPlaceholder(value, locale)) continue
    if (withoutParams(value).trim().length < COPY_MIN_LENGTH) continue
    seen.set(value, [...(seen.get(value) ?? []), locale])
  }
  return seen
}

/**
 * The keys whose translation is the same prose in two unrelated languages while it isn't the English: one language
 * copied into another (the same-script swap {@link wrongScript} can't see). Maps each such key to the locales sharing
 * it.
 */
export function copiedAcross(
  english: Map<string, string>,
  byLocale: Map<string, Map<string, string>>
): Map<string, string[]> {
  const copies = new Map<string, string[]>()
  for (const [key, source] of english) {
    for (const locales of localesByValue(key, source, byLocale).values()) {
      const related = locales.length === 2 && RELATED.some(pair => locales.every(locale => pair.has(locale)))
      if (locales.length > 1 && !related) copies.set(key, locales)
    }
  }
  return copies
}
