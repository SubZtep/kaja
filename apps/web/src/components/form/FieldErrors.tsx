import type { AnyFieldApi } from "@tanstack/react-form"
import { CircleAlert } from "lucide-react"
import { validationMessage } from "../../lib/error-messages"

/** A field's error messages, under it in red: the site's own text instead of the browser's validation bubble (forms are noValidate). */
export function FieldErrors({ field }: Readonly<{ field: AnyFieldApi }>) {
  if (field.state.meta.isValid) {
    return null
  }

  const messages = [...new Set(field.state.meta.errors.map(error => validationMessage(error?.message)))]
  return (
    <ul role="alert" className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-[13px] text-red-400">
      {messages.map(message => (
        <li key={message} className="flex items-start gap-1.5">
          <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          {message}
        </li>
      ))}
    </ul>
  )
}
