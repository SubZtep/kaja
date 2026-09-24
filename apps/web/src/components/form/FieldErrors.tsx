import type { AnyFieldApi } from "@tanstack/react-form"
import { validationMessage } from "../../lib/error-messages"

/** Displays field error messages when present. */
export function FieldErrors({ field }: Readonly<{ field: AnyFieldApi }>) {
  if (field.state.meta.isValid) {
    return null
  }

  return (
    <div className="border border-red-800 bg-red-950 text-red-100 opacity-80 rounded-sm text-sm mt-1 px-1 tracking-wide">
      <ul>
        {field.state.meta.errors
          .map(error => validationMessage(error?.message))
          .map(message => (
            <li key={message}>{message}</li>
          ))}
      </ul>
    </div>
  )
}
