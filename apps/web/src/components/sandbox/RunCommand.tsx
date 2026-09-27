import { Field } from "@base-ui/react/field"
import { cn } from "@kaja/shared/ui"
import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { runCommand } from "../../lib/sandbox"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"

const LOOKS = {
  crt: { frame: "crt-frame px-4 py-3", code: "font-crt text-neon text-sm" },
  plain: { frame: "rounded-md bg-black/40 p-3", code: "font-mono text-muted text-xs" }
} as const

/** The sandbox's `docker run` (with `sandboxKey`, linked to that account), a switch that adds the memory and CPU limits, what that means, and a copy button. */
export function RunCommand({
  sandboxKey,
  look = "plain"
}: Readonly<{ sandboxKey?: string; look?: keyof typeof LOOKS }>) {
  const [limited, setLimited] = useState(false)
  const [copied, setCopied] = useState(false)
  const command = runCommand(sandboxKey, limited)

  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex items-start gap-3", LOOKS[look].frame)}>
        <code className={cn("min-w-0 flex-1 wrap-break-word", LOOKS[look].code)}>{command}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? m.hero_copy_copied() : m.hero_copy_copy()}
          title={copied ? m.hero_copy_copied() : m.hero_copy_copy()}
          className="shrink-0 cursor-pointer rounded-sm p-1 text-muted hover:text-fg"
        >
          {copied ? <Check size={16} className="text-neon" /> : <Copy size={16} />}
        </button>
      </div>
      <Field.Root>
        <Field.Label className="flex cursor-pointer items-start gap-3">
          <Checkbox className="mt-0.5 shrink-0" checked={limited} onCheckedChange={setLimited} />
          <span>
            <span className="block text-fg text-sm">{m.sandbox_limit_label()}</span>
            <span className="block text-muted text-xs">{limited ? m.sandbox_limit_on() : m.sandbox_limit_off()}</span>
          </span>
        </Field.Label>
      </Field.Root>
    </div>
  )
}
