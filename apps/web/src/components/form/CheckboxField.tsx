import { Field } from "@base-ui/react/field"
import { useFieldContext } from "../../lib/form"
import { FieldErrors } from "./FieldErrors"
import { Checkbox } from "./primitives/Checkbox"

export function CheckboxField({ label, className }: Readonly<{ label: string; className?: string }>) {
  const field = useFieldContext<boolean>()

  return (
    <Field.Root
      name={field.name}
      invalid={!field.state.meta.isValid}
      dirty={field.state.meta.isDirty}
      touched={field.state.meta.isTouched}
      className={className}
    >
      <Field.Label className="flex gap-1.5 items-center cursor-pointer">
        <Checkbox
          name={field.name}
          checked={field.state.value}
          onBlur={field.handleBlur}
          onCheckedChange={field.handleChange}
        />
        {label}
      </Field.Label>
      <Field.Error match={!field.state.meta.isValid}>
        <FieldErrors field={field} />
      </Field.Error>
    </Field.Root>
  )
}
