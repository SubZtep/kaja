import { createFormHook } from "@tanstack/react-form"
import { CheckboxField } from "../components/form/checkbox-field"
import { SelectField } from "../components/form/select-field"
import { TextAreaField } from "../components/form/text-area-field"
import { TextField } from "../components/form/text-field"
import { fieldContext, formContext } from "./form-contexts"

export const { useAppForm } = createFormHook({
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
