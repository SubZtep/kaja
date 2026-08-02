import { createFormHook } from "@tanstack/react-form"
import { CheckboxField } from "../components/form/CheckboxField"
import { SelectField } from "../components/form/SelectField"
import { TextField } from "../components/form/TextField"
import { fieldContext, formContext } from "./form-contexts"

export { useFieldContext } from "./form-contexts"

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    CheckboxField,
    SelectField
  },
  formComponents: {}
})
