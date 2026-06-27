import { Text } from "ink"
import { useAuth } from "../hooks/use-auth"
import { useStore } from "../store"
import { Auth } from "./Auth"
import NodeRunner from "./NodeRunner"
import { NodeSetup } from "./NodeSetup"

export function App() {
  const { isLoading, isLoggedIn } = useAuth()
  const nodeId = useStore(state => state.nodeId)

  return (
    <>
      {/* <Gradient name="rainbow">
        <BigText font="slick" text="kaja.io" />
      </Gradient> */}

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
