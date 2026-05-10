import { getCurrentIp } from "@kaja/geo"
import { kaja } from "../lib/clients"

/** Register the CLI app with the API. */
export async function spawnNode() {
  const ip = await getCurrentIp()
  console.log("spawning node on", [kaja.host(), ip])

  // kaja.registerNode({
  //   nodeId: Bun.randomUUIDv7(),
  //   name: "cli"
  // })
}
