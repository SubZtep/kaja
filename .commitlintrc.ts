/** commitlint's level for an off rule (its RuleConfigSeverity.Disabled)  */
const DISABLED = 0

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [DISABLED],
    "body-max-line-length": [DISABLED]
  }
}
