import { Text } from "ink"
import { useAuth } from "../hooks/use-auth"
import { useStore } from "../store"
import { Auth } from "./Auth"
import { Logo } from "./Logo"
import NodeRunner from "./NodeRunner"
import { NodeSetup } from "./NodeSetup"

export function App() {
  const { isLoading, isLoggedIn } = useAuth()
  const nodeId = useStore(state => state.nodeId)

  return (
    <>
      <Logo />

      {isLoading ? (
        <Text>Loading...</Text>
      ) : !isLoggedIn ? (
        <Auth />
      ) : !nodeId ? (
        <NodeSetup />
      ) : (
        /* heartbeat */
        <NodeRunner />
      )}
    </>
  )
}
