import { Field } from "@base-ui/react/field"
import { cn } from "@kaja/shared/ui"
import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { useFieldContext } from "../../lib/form-contexts"
import { m } from "../../paraglide/messages.js"
import { FieldErrors } from "./FieldErrors"
import { Text } from "./primitives/Text"

/** A form text input; a password one gets a show/hide toggle, and `hint` a muted line under it. */
export function TextField({
  label,
  layout = "horizontal",
  hint,
  type,
  ...props
}: Readonly<{ label: string; layout?: "horizontal" | "stack"; hint?: string } & React.ComponentProps<"input">>) {
  const field = useFieldContext<string>()
  const isStack = layout === "stack"
  const [shown, setShown] = useState(false)
  const isPassword = type === "password"

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
            isStack ? "font-medium text-[13px] text-muted" : "flex w-48 items-center justify-between align-middle"
          )}
        >
          {isStack ? label : `${label}:`}
        </Field.Label>
        <div className="relative w-full">
          <Text
            variant="3d"
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={e => field.handleChange(e.target.value)}
            type={isPassword && shown ? "text" : type}
            className={cn(isPassword && "pr-10")}
            {...props}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setShown(s => !s)}
              aria-label={shown ? m.password_hide() : m.password_show()}
              title={shown ? m.password_hide() : m.password_show()}
              className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted hover:text-fg"
            >
              {shown ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          ) : null}
        </div>
      </div>
      {hint ? <p className="m-0 mt-1 text-[13px] text-muted/80">{hint}</p> : null}
      <Field.Error match={!field.state.meta.isValid}>
        <FieldErrors field={field} />
      </Field.Error>
    </Field.Root>
  )
}
