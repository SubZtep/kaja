/** commitlint's level for an off rule (its RuleConfigSeverity.Disabled)  */
const DISABLED = 0
/** commitlint's level for a failing rule (its RuleConfigSeverity.Error) */
const ERROR = 2

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [DISABLED],
    "body-max-line-length": [DISABLED],
    "header-max-length": [ERROR, "always", 120]
  }
}
