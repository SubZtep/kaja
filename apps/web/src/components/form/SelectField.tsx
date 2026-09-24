import { Field } from "@base-ui/react/field"
import { cn } from "@kaja/shared"
import { useFieldContext } from "../../lib/form-contexts"
import { FieldErrors } from "./FieldErrors"

export function SelectField({
  label,
  options,
  layout = "horizontal",
  ...props
}: Readonly<
  { label: string; options: { value: string; label: string }[]; layout?: "horizontal" | "stack" } & Omit<
    React.ComponentProps<"select">,
    "value"
  >
>) {
  const field = useFieldContext<string>()
  const isStack = layout === "stack"

  return (
    <Field.Root
      name={field.name}
      invalid={!field.state.meta.isValid}
      dirty={field.state.meta.isDirty}
      touched={field.state.meta.isTouched}
    >
      <div className={cn(isStack ? "flex flex-col gap-1.5" : "md:flex")}>
        <Field.Label
          htmlFor={field.name}
          className={cn(
            isStack ? "font-medium text-[13px] text-muted" : "flex w-48 align-middle items-center justify-between"
          )}
        >
          {isStack ? label : `${label}:`}
        </Field.Label>
        <select
          id={field.name}
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
