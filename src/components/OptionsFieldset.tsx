import { createSignal, createEffect, Switch, Match } from "solid-js"
import { startMessageLoop, stopMessageLoop } from "../lib/loop"
import { sendMessage } from "../lib/websocket"
import { state, setState } from "../state"
import styles from "./App.module.css"

export default () => {
  const [cameraEnabled, setCameraEnabled] = createSignal(false)

  createEffect(() => {
    setState({ cameraEnabled: cameraEnabled() })
  })

  return (
    <fieldset class={styles.options}>
      <legend>Options</legend>

      <label>
        <input
          type="color"
          value={/*@once*/ state.colour}
          onInput={ev => {
            setState({ colour: ev.target.value })
            sendMessage({
              id: state.id,
              colour: state.colour,
              time: Date.now(),
            })
          }}
        />
        <span class="landscape">Your colour</span>
        <span class="portrait">Colour</span>
      </label>

      <button class={cameraEnabled() ? "" : "pulse"} onClick={() => setCameraEnabled(!cameraEnabled())}>
        <Switch>
          <Match when={!cameraEnabled()}>Enable camera</Match>
          <Match when={cameraEnabled()}>Disable camera</Match>
        </Switch>
      </button>

      <label>
        <input
          type="checkbox"
          disabled={!state.connected}
          onChange={ev => {
            const broadcast = ev.target.checked
            if (broadcast) {
              startMessageLoop(state.broadcastFPS)
            } else {
              stopMessageLoop()
            }
            setState({ broadcast })
          }}
        />
        Go to lobby
      </label>
    </fieldset>
  )
}
