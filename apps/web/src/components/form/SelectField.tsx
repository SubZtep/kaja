import { Field } from "@base-ui/react/field"
import { useFieldContext } from "../../lib/form-contexts"
import { FieldErrors } from "./FieldErrors"

export function SelectField({
  label,
  options,
  ...props
}: Readonly<
  { label: string; options: { value: string; label: string }[] } & Omit<React.ComponentProps<"select">, "value">
>) {
  const field = useFieldContext<string>()

  return (
    <Field.Root
      name={field.name}
      invalid={!field.state.meta.isValid}
      dirty={field.state.meta.isDirty}
      touched={field.state.meta.isTouched}
    >
      <div className="md:flex">
        <Field.Label className="flex w-48 align-middle items-center justify-between">{label}:</Field.Label>
        <select
          name={field.name}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={e => field.handleChange(e.target.value)}
          className="w-full rounded-lg border border-border/50 bg-surface px-3 py-2 text-base text-fg focus:outline-2 focus:-outline-offset-1 focus:outline-neon/50 dark:scheme-dark"
          {...props}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <Field.Error match={!field.state.meta.isValid}>
        <FieldErrors field={field} />
      </Field.Error>
    </Field.Root>
  )
}
