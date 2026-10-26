import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { cn } from "../../lib/cn"
import { m } from "../../paraglide/messages.js"

/** A small copy icon that puts `text` on the clipboard and shows a check for a moment. */
export function CopyButton({ text, className }: Readonly<{ text: string; className?: string }>) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? m.hero_copy_copied() : m.hero_copy_copy()}
      title={copied ? m.hero_copy_copied() : m.hero_copy_copy()}
      className={cn("text-muted hover:text-fg shrink-0 cursor-pointer rounded-sm p-1", className)}
    >
      {copied ? <Check size={16} className="text-neon" /> : <Copy size={16} />}
    </button>
  )
}
