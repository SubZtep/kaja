import { Checkbox as CheckboxBase } from "@base-ui/react/checkbox"
import { cn } from "@kaja/shared"
import { Check } from "lucide-react"
import type React from "react"

type Props = {
  name?: string
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  required?: boolean
  className?: string
  "aria-label"?: string
  onBlur?: React.FocusEventHandler
  onCheckedChange?: (checked: boolean) => void
}

export function Checkbox({
  name,
  checked,
  defaultChecked,
  disabled,
  required,
  className,
  "aria-label": ariaLabel,
  onBlur,
  onCheckedChange
}: Readonly<Props>) {
  return (
    <CheckboxBase.Root
      name={name}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      onBlur={onBlur}
      onCheckedChange={onCheckedChange}
      className={cn(
        "flex size-5 cursor-pointer items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon/50 data-checked:border data-checked:border-neon/40 data-checked:bg-neon/20 data-unchecked:border data-unchecked:border-muted/60",
        className
      )}
    >
      <CheckboxBase.Indicator className="flex text-neon data-unchecked:hidden">
        <Check size={18} strokeWidth={3} />
      </CheckboxBase.Indicator>
    </CheckboxBase.Root>
  )
}
