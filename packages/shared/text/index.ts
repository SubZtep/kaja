/** Extracts the first part of a name. */
export function getFirstName(fullName?: string, prefix = " ") {
  return fullName ? prefix + fullName.split(" ").shift() : ""
}

/** A user's name, or their email when the name is blank. */
export function getDisplayName(user: { name?: string | null; email: string }) {
  return user.name?.trim() || user.email
}

/** Capitalize the first letter of the given string. */
export function capitalized(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Formats a device authorization user code for display, e.g. "ABCD2345" → "ABCD-2345". Display-only — never send the dashed form back to the server. */
export function formatDeviceUserCode(userCode: string) {
  return userCode.length > 4 ? `${userCode.slice(0, 4)}-${userCode.slice(4)}` : userCode
}

/**
 * Title-cases a hyphen/underscore/space-separated label or top bar
 * @example "my/kimi-k2" → "Kimi K2".
 */
export function titleCase(label?: string) {
  if (label == null) return null
  return (label.split("/").pop() ?? label)
    .split(/[-_\s]+/)
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ")
}

/**
 * A models.toml id for a provider's model name: its last path part, lowercased, with every run of other
 * characters as one dash.
 * @example "accounts/fireworks/models/glm-5p3-flash" → "glm-5p3-flash", "qwen3.5:4b" → "qwen3-5-4b"
 */
export function modelSlug(model: string): string {
  const last = model.split("/").findLast(Boolean) ?? model
  return (
    last
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "model"
  )
}

/** {@link modelSlug}, made unique against `taken`: `-<provider>` for a name another provider already uses, then numbered. */
export function uniqueModelSlug(taken: ReadonlySet<string>, model: string, provider: string): string {
  const base = modelSlug(model)
  if (!taken.has(base)) return base
  const withProvider = `${base}-${modelSlug(provider)}`
  if (!taken.has(withProvider)) return withProvider
  let n = 2
  while (taken.has(`${withProvider}-${n}`)) n++
  return `${withProvider}-${n}`
}

/** Drops trailing slashes, e.g. "https://kaja.io//" → "https://kaja.io". A loop, since `/\/+$/` backtracks on long runs of slashes. */
export function trimTrailingSlashes(value: string) {
  let end = value.length
  while (end > 0 && value[end - 1] === "/") end--
  return value.slice(0, end)
}

/** The text of a turn that ends on a question: what streamed, plus the question unless the streamed text already ends with it (a reply ending in "?" streams and then arrives as the question). */
export function withQuestion(streamed: string, question: string) {
  if (!streamed.trim()) return question
  return streamed.trimEnd().endsWith(question.trim()) ? streamed : `${streamed}\n\n${question}`
}
