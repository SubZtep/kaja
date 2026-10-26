import { Field } from "@base-ui/react/field"
import type { ComponentProps } from "react"
import { useFieldContext } from "../../lib/form-contexts"
import { FieldErrors } from "./field-errors"
import { Otp } from "./primitives/otp"

/** A form field for a one-time code, one box per character, with its label stacked above. */
export function OtpField({
  label,
  ...props
}: Readonly<{ label: string } & Omit<ComponentProps<typeof Otp>, "name" | "value" | "onValueChange">>) {
  const field = useFieldContext<string>()

  return (
    <Field.Root
      name={field.name}
      invalid={!field.state.meta.isValid}
      dirty={field.state.meta.isDirty}
      touched={field.state.meta.isTouched}
    >
      <div className="flex flex-col gap-1.5">
        <Field.Label className="text-muted text-[13px] font-medium">{label}</Field.Label>
        <Otp
          name={field.name}
          value={field.state.value}
          onValueChange={value => field.handleChange(value)}
          onBlur={field.handleBlur}
          {...props}
        />
      </div>
      <Field.Error match={!field.state.meta.isValid}>
        <FieldErrors field={field} />
      </Field.Error>
    </Field.Root>
  )
}
