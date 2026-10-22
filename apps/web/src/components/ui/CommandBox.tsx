import { cn } from "@kaja/shared/ui"
import { CopyButton } from "./CopyButton"

const LOOKS = {
  crt: { frame: "crt-frame px-4 py-3", code: "font-crt text-neon text-sm", caret: true },
  plain: { frame: "rounded-md bg-black/40 p-3", code: "font-mono text-muted text-xs", caret: false }
} as const

/** A shell command to copy, shown in full and wrapped; the terminal look adds a blinking cursor. */
export function CommandBox({ command, look = "plain" }: Readonly<{ command: string; look?: keyof typeof LOOKS }>) {
  return (
    <div className={cn("flex items-start gap-3", LOOKS[look].frame)}>
      <code className={cn("min-w-0 flex-1 wrap-break-word", LOOKS[look].code)}>
        {command}
        {LOOKS[look].caret ? (
          <span className="bg-neon ml-0.5 inline-block h-3.5 w-1.5 animate-[caret-blink_1.1s_steps(1)_infinite] align-[-1px]" />
        ) : null}
      </code>
      <CopyButton text={command} />
    </div>
  )
}
