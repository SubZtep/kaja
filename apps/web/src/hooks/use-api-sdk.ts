import { useContext } from "react"
import { SDKContext } from "../components/Providers"

export function useApiSdk() {
  const sdk = useContext(SDKContext)
  if (!sdk) {
    throw new Error("useApiSdk must be used within an SDKProvider")
  }
  return sdk
}
