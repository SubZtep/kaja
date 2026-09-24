import { m } from "../../paraglide/messages.js"

/** A failed load, in the page's language; the detail is the server's (technical, often English) reason. */
export function ErrorNotice({ error }: Readonly<{ error?: { message: string } | null }>) {
  if (!error) return null
  return <p className="mb-6 text-red-400 text-sm">{m.load_error({ detail: error.message })}</p>
}
