import { openApiSpec } from "./openapi-spec"

const outputPath = new URL("../openapi.json", import.meta.url)
const content = `${JSON.stringify(openApiSpec, null, 2)}\n`

await Bun.write(outputPath, content)
console.log(`Wrote OpenAPI spec to ${outputPath.pathname}`)
