import { setState } from "../state"

export function createWebSocketConnection() {
  const socket = new WebSocket(import.meta.env.VITE_WSPP)

  socket.addEventListener("open", () => {
    setState({ connected: true })
  })

  socket.addEventListener("close", () => {
    setState({ connected: false })
  })

  const sendMessage = (msg: Record<string, any>) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg))
    }
  }

  return { socket, sendMessage }
}

export const { socket, sendMessage } = createWebSocketConnection()
