import { Field } from "@base-ui/react/field"
import { useFieldContext } from "../../lib/form-contexts"
import { FieldErrors } from "./FieldErrors"
import { Text } from "./primitives/Text"

export function TextField({ label, ...props }: Readonly<{ label: string } & React.ComponentProps<"input">>) {
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
        <Text
          variant="3d"
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
