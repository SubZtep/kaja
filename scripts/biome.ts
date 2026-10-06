// Runs the Biome CLI installed on this machine (Biome isn't a dependency), or says how to install it; the version is the one biome.json's $schema names.
// Usage: bun scripts/biome.ts <biome args>

const biome = Bun.which("biome")
if (!biome) {
  const config = await Bun.file(`${import.meta.dir}/../biome.json`).json()
  const version = /\/schemas\/([^/]+)\//.exec(config.$schema)?.[1] ?? "latest"
  console.error(
    `Biome isn't installed. Install the CLI (${version}): https://biomejs.dev/guides/manual-installation/ or \`bun add -g @biomejs/biome@${version}\``
  )
  process.exit(1)
}

const child = Bun.spawn([biome, ...Bun.argv.slice(2)], { stdio: ["inherit", "inherit", "inherit"] })
process.exit(await child.exited)
