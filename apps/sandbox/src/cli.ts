import { runHealthCheck } from "./health"
import { startSandbox } from "./server"

// The bundle's entry: `bun sandbox.js health` is the Docker HEALTHCHECK (reads a status file, starts nothing); anything else runs the sandbox.
if (process.argv[2] === "health") runHealthCheck()
else await startSandbox()
