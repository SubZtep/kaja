import { Field } from "@base-ui/react/field"
import { useState } from "react"
import { runCommand } from "../../lib/sandbox"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { CommandBox } from "../ui/CommandBox"

/** The sandbox's `docker run` (with `sandboxKey`, linked to that account), a switch that adds the memory and CPU limits, what that means, and a copy button. */
export function RunCommand({ sandboxKey, look = "plain" }: Readonly<{ sandboxKey?: string; look?: "crt" | "plain" }>) {
  const [limited, setLimited] = useState(true)
  const command = runCommand(sandboxKey, limited)

  return (
    <div className="flex flex-col gap-3">
      <CommandBox command={command} look={look} />
      <Field.Root>
        <Field.Label className="flex cursor-pointer items-start gap-3">
          <Checkbox className="mt-0.5 shrink-0" checked={limited} onCheckedChange={setLimited} />
          <span>
            <span className="text-fg block text-sm">{m.sandbox_limit_label()}</span>
            <span className="text-muted block text-xs">{limited ? m.sandbox_limit_on() : m.sandbox_limit_off()}</span>
          </span>
        </Field.Label>
      </Field.Root>
    </div>
  )
}
