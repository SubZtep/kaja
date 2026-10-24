---
name: translate
description: Translate the untranslated "[<locale>] lorem ipsum" placeholders in every non-en-GB locale file. Only when the user runs /translate.
argument-hint: "[locale...]"
disable-model-invocation: true
allowed-tools: Bash(bun sync:locales --todo), Bash(bun sync:locales --apply *), Write, Read, Agent, mcp__claude_ai_DeepL__translate-text
---

Fill in the placeholders that `bun sync:locales` leaves in the non-en-GB locale files. Never read or edit those files directly; go only through the script.

1. Run `bun sync:locales --todo` and write its output to `todo.json` in your scratchpad directory. It is a JSON array of `{ file, key, english, nearby }`, one entry per untranslated key and language; the locale is the file name (`apps/tui/locales/hu-HU.toml` → hu-HU). `nearby` holds already-translated keys from the same section, with their English and translation. If arguments were given ($ARGUMENTS), handle only those locales. If the array is empty, say so and stop.
2. Spawn the `translate-context` agent with the todo file's path and a `notes.json` path next to it. It returns notes on where each key shows up in the UI, its space limits and what its `{params}` hold. Read the notes file.
3. Translate each `english` into its file's language, using the key's note and its `nearby` translations. Language notes: en-US is American English (US spelling and vocabulary; otherwise keep the en-GB wording), hu-HU is Hungarian (informal "te" form), nan-TW is Taiwanese Hokkien written in Han-ji, zh-TW is Traditional Chinese (Taiwan); infer any other from its code.
   - Language notes: es-ES is European Spanish, ja-JP is Japanese, ko-KR is Korean, de-DE is German, fr-FR is French, and pt-BR is Brazilian Portuguese.
   - Reuse the terms and tone of the `nearby` translations (e.g. how "ability", "persona" or "session" is already rendered), and keep terminology consistent across this run.
   - If the DeepL MCP tools are available (`mcp__claude_ai_DeepL__translate-text`), produce the translations with DeepL instead of by hand, batching all strings of one language per call, and still fit them to the note's wording, terms and space limits. If DeepL is missing, not signed in or out of quota, translate yourself.
   - Never let DeepL touch `{params}` (the dynamic placeholders): before sending, swap each one for an opaque token like `<x id="0"/>` (with XML tag handling and `ignore_tags` `x` if the tool supports it) and restore them afterwards, or otherwise check every result still contains the exact same `{params}` as the English, fixing by hand where it doesn't. Do the same for product names, commands and code identifiers.
   - Translations don't need to be publication-ready; convey the meaning clearly. Native speakers review them later.
   - Keep `{params}` exactly, and keep line breaks, leading indentation, markdown, emoji, HTML tags and punctuation structure. Respect the note's space limits.
   - Don't translate product names (Kaja, Telegram, Google, ...), commands, flags, file paths or code identifiers.
4. Write the entries as a JSON array of `{ file, key, english, value }` (`value` is the translation, drop `nearby`) to `done.json` in the scratchpad, then run `bun sync:locales --apply <that file>`. It rejects entries whose `{params}` differ from en-GB; fix and re-apply only those.
5. Finish with a per-file count of keys translated, and flag any string you were unsure about.
