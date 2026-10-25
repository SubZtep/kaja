import { Field } from "@base-ui/react/field"
import { cn } from "@kaja/shared/ui"
import { useFieldContext } from "../../lib/form-contexts"
import { FieldErrors } from "./field-errors"

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
            isStack ? "text-muted text-[13px] font-medium" : "flex w-48 items-center justify-between align-middle"
          )}
        >
          {isStack ? label : `${label}:`}
        </Field.Label>
        <textarea
          className="border-border/60 text-fg focus:outline-neon/50 w-full rounded-sm border bg-black/25 px-3 py-2 text-base focus:outline-2 focus:-outline-offset-1 data-invalid:border-red-500/70 dark:scheme-dark"
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
