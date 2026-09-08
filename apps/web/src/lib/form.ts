import { createFormHook } from "@tanstack/react-form"
import { CheckboxField } from "../components/form/CheckboxField"
import { SelectField } from "../components/form/SelectField"
import { TextAreaField } from "../components/form/TextAreaField"
import { TextField } from "../components/form/TextField"
import { fieldContext, formContext } from "./form-contexts"

export { useFieldContext } from "./form-contexts"

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextAreaField,
    CheckboxField,
    SelectField
  },
  formComponents: {}
})
