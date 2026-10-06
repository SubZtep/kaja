import pkg from "../../package.json" with { type: "json" }

/** What the terminal calls itself to the Kaja API, so the web can name its sessions ("Kaja terminal 0.29.4") instead of Bun's default agent. */
export const KAJA_USER_AGENT = `kaja-tui/${pkg.version}`
