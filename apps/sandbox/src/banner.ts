import pkg from "../package.json"

// The Kaja monster, /(o▣o)\, in block characters.
const MONSTER = `
    ▗▘                               ▝▖
   ▗▘    ▄▀▀▀▀▄   ▄▀▀▀▀▀▄   ▄▀▀▀▀▄     ▝▖
   █    █  ▄▄  █  █  ▄  █  █   ▄  █     █
   █    █  ▀▀  █  █  █  █  █   ▀  █     █
   ▝▖    ▀▄▄▄▄▀   ▀▄▄▀▄▄▀   ▀▄▄▄▄▀     ▗▘
    ▝▖                               ▗▘`

/** What a sandbox prints first, so its logs (e.g. in Docker Desktop) say what it is and how it's set up. */
export function printBanner(facts: Record<string, string>): void {
  const width = Math.max(...Object.keys(facts).map(key => key.length))
  console.log(MONSTER)
  console.log(`\n    kaja sandbox ${pkg.version}\n`)
  for (const [key, value] of Object.entries(facts)) console.log(`    ${key.padEnd(width)}  ${value}`)
  console.log("")
}
