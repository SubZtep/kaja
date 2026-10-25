import { OTPField } from "@base-ui/react/otp-field"
import { cn } from "@kaja/shared/ui"
import { Fragment } from "react"
import { m } from "../../../paraglide/messages.js"

/** A code typed one character per box; `groupSize` puts a dash between runs (4 → ABCD-EFGH, as the TUI shows it). */
export function Otp({
  length,
  groupSize,
  autoFocus,
  className,
  ...props
}: Readonly<{ groupSize?: number; className?: string } & Omit<OTPField.Root.Props, "className" | "render">>) {
  return (
    <OTPField.Root length={length} className={cn("flex items-center gap-1.5 sm:gap-2", className)} {...props}>
      {Array.from({ length }, (_, index) => (
        <Fragment key={index}>
          {groupSize && index > 0 && index % groupSize === 0 ? (
            <OTPField.Separator className="text-muted px-0.5 select-none">-</OTPField.Separator>
          ) : null}
          <OTPField.Input
            autoFocus={autoFocus && index === 0}
            aria-label={m.otp_slot_label({ index: index + 1, length })}
            className="border-border/60 text-fg focus:outline-neon/50 data-filled:border-border h-11 w-8 rounded-sm border bg-black/25 text-center font-mono text-lg uppercase focus:outline-2 focus:-outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-invalid:border-red-500/70 sm:w-10"
          />
        </Fragment>
      ))}
    </OTPField.Root>
  )
}
