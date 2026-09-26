---
name: translate
description: Translate the untranslated "[<locale>] lorem ipsum" placeholders in every non-en-GB locale file. Only when the user runs /translate.
argument-hint: "[locale...]"
disable-model-invocation: true
allowed-tools: Bash(bun sync:locales --todo), Bash(bun sync:locales --apply *), Write, Read, Agent
---

Fill in the placeholders that `bun sync:locales` leaves in the non-en-GB locale files. Never read or edit those files directly; go only through the script.

1. Run `bun sync:locales --todo` and write its output to `todo.json` in your scratchpad directory. It is a JSON array of `{ file, key, english, nearby }`, one entry per untranslated key and language; the locale is the file name (`apps/tui/locales/hu-HU.toml` → hu-HU). `nearby` holds already-translated keys from the same section, with their English and translation. If arguments were given ($ARGUMENTS), handle only those locales. If the array is empty, say so and stop.
2. Spawn the `translate-context` agent with the todo file's path and a `notes.json` path next to it. It returns notes on where each key shows up in the UI, its space limits and what its `{params}` hold. Read the notes file.
3. Translate each `english` into its file's language, using the key's note and its `nearby` translations. Language notes: hu-HU is Hungarian (informal "te" form), nan-TW is Taiwanese Hokkien written in Han-ji, zh-TW is Traditional Chinese (Taiwan); infer any other from its code.
   - Reuse the terms and tone of the `nearby` translations (e.g. how "ability", "persona" or "session" is already rendered), and keep terminology consistent across this run.
   - Translations don't need to be publication-ready; convey the meaning clearly. Native speakers review them later.
   - Keep `{params}` exactly, and keep line breaks, leading indentation, markdown, emoji, HTML tags and punctuation structure. Respect the note's space limits.
   - Don't translate product names (Kaja, Telegram, Google, ...), commands, flags, file paths or code identifiers.
4. Write the entries as a JSON array of `{ file, key, english, value }` (`value` is the translation, drop `nearby`) to `done.json` in the scratchpad, then run `bun sync:locales --apply <that file>`. It rejects entries whose `{params}` differ from en-GB; fix and re-apply only those.
5. Finish with a per-file count of keys translated, and flag any string you were unsure about.
