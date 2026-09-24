import { CheckboxGroup } from "@base-ui/react/checkbox-group"
import { Field } from "@base-ui/react/field"
import type { ModelTask } from "@kaja/schema/api"
import { Checkbox } from "../../../../../components/form/primitives/Checkbox"

/** Every task a model can serve, in the order the checkboxes show them. */
export const MODEL_TASKS: ModelTask[] = ["chat", "tts", "stt", "embedding", "image-generation", "rerank", "summarize"]

/** A checkbox per {@link MODEL_TASKS} entry, for the add and edit model forms. */
export function TaskCheckboxes({
  value,
  onChange
}: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  return (
    <CheckboxGroup value={value} onValueChange={onChange} className="flex flex-wrap gap-x-4 gap-y-2">
      {MODEL_TASKS.map(task => (
        <Field.Root key={task} name={task} className="flex items-center gap-2 text-fg text-sm">
          <Field.Label className="flex items-center gap-2">
            <Checkbox name={task} />
            {task}
          </Field.Label>
        </Field.Root>
      ))}
    </CheckboxGroup>
  )
}
