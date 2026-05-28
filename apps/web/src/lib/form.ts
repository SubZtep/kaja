import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import { CheckboxField } from "../components/form/CheckboxField"
import { TextField } from "../components/form/TextField"

export const { fieldContext, formContext, useFieldContext } = createFormHookContexts()

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    CheckboxField
  },
  formComponents: {}
})
