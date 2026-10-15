import { runEgressCheck } from "./egress-check"
import { runHealthCheck } from "./health"
import { startSandbox } from "./server"

// The bundle's entry: `bun sandbox.js health` is the Docker HEALTHCHECK (reads a status file, starts nothing), `egress-check <url>` tests one request through the egress proxy and WEB_PROXY; anything else runs the sandbox.
const command = process.argv[2]
if (command === "health") runHealthCheck()
else if (command === "egress-check") await runEgressCheck(process.argv[3])
else await startSandbox()
