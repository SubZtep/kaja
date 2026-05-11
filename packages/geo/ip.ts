const currentIpProviders = ["https://api64.ipify.org?format=json", "https://api.ipify.org?format=json"]

export async function getCurrentIp() {
  for (const url of currentIpProviders) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const payload = await response.json()
      const ip = payload?.ip
      if (typeof ip === "string" && ip.length > 0) return ip
    } catch (error: unknown) {
      console.error(`Error getting current IP: ${error instanceof Error ? error.message : String(error)}`)
      // Try next provider.
    }
  }

  return undefined
}
