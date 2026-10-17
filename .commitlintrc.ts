const DISABLED = 0
const ERROR = 2

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [DISABLED],
    "body-max-line-length": [DISABLED],
    "header-max-length": [ERROR, "always", 120]
  }
}
