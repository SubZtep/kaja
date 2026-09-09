import { Field } from "@base-ui/react/field"
import { cn } from "@kaja/shared"
import { useFieldContext } from "../../lib/form-contexts"
import { FieldErrors } from "./FieldErrors"

export function TextAreaField({
  label,
  layout = "horizontal",
  ...props
}: Readonly<{ label: string; layout?: "horizontal" | "stack" } & React.ComponentProps<"textarea">>) {
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
          className={cn(
            isStack ? "font-medium text-[13px] text-muted" : "flex w-48 align-middle items-center justify-between"
          )}
        >
          {isStack ? label : `${label}:`}
        </Field.Label>
        <textarea
          className="w-full rounded-lg border border-border/50 bg-surface px-3 py-2 text-base text-fg focus:outline-2 focus:-outline-offset-1 focus:outline-neon/50 dark:scheme-dark"
          name={field.name}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={e => field.handleChange(e.target.value)}
          {...props}
        />
      </div>
      <Field.Error match={!field.state.meta.isValid}>
        <FieldErrors field={field} />
      </Field.Error>
    </Field.Root>
  )
}
