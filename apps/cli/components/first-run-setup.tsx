import { Box, Text } from "ink"
import { t } from "../lib/i18n"
import { listPaths } from "../lib/paths"
import { SelectMenu } from "./elem/select-menu"

export type FirstRunChoice = { template?: "fireworks" | "ollama" }

/**
 * One-shot first-run prompt for `--local`, rendered before the main App and
 * resolved via `onDone`: which provider's example models.toml to start
 * from. Dismissing (escape/backspace/delete, or Ctrl-C) calls `onCancel`
 * instead, so nothing gets written unless the user actually picks an option.
 */
export function FirstRunSetup({
  onDone,
  onCancel
}: Readonly<{ onDone: (choice: FirstRunChoice) => void; onCancel: () => void }>) {
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text dimColor>{t("firstRun.paths")}</Text>
        {listPaths().map(({ label, path }) => (
          <Text key={path} dimColor>
            {"  "}
            {label}: {path}
          </Text>
        ))}
      </Box>
      <Text>{t("firstRun.intro")}</Text>
      <SelectMenu
        items={[t("firstRun.providerFireworks"), t("firstRun.providerOllama"), t("firstRun.providerSkip")]}
        width={70}
        onSelect={index => {
          if (index === 0) onDone({ template: "fireworks" })
          else if (index === 1) onDone({ template: "ollama" })
          else onDone({})
        }}
        onClose={onCancel}
      />
    </Box>
  )
}
