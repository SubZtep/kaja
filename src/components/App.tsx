import { For, Show } from "solid-js"
import { state, players } from "../state"
import { HAND_ANGLES } from "../const"
import styles from "./App.module.css"
import ThreeScene from "./ThreeScene"
import Finger from "./Finger"
import CameraStream from "./CameraStream"
import OptionsFieldset from "./OptionsFieldset"
import HandEnvironment from "./HandEnvironment"
import HandModel from "./HandModel"

export default () => {
  return (
    <>
      <Show when={state.isDesktop}>
        <For each={HAND_ANGLES}>
          {item => (
            <>
              <Finger name={item[0]} />
            </>
          )}
        </For>
      </Show>

      <div class={`${styles.scenes} ${state.isDesktop ? "grid-col-span-5" : "grid-col-span-2"}`}>
        <For each={state.playerIds}>
          {pid => (
            <ThreeScene pid={pid} colour={players.get(pid)?.colour}>
              {scene => (
                <>
                  <HandEnvironment scene={scene} />
                  <HandModel pid={pid} scene={scene} />
                </>
              )}
            </ThreeScene>
          )}
        </For>
      </div>

      <div class={`${styles.monitor}${state.isDesktop ? " grid-col-span-2" : ""}`}>
        <CameraStream />
        <Show when={state.isDesktop}>
          <ThreeScene colour={state.colour} translucent={state.cameraEnabled}>
            {scene => (
              <>
                <HandEnvironment scene={scene} />
                <HandModel scene={scene} />
              </>
            )}
          </ThreeScene>
        </Show>
      </div>

      <OptionsFieldset />

      <Show when={state.isDesktop}>
        <fieldset class="grid-col-span-2">
          <legend>Readme</legend>
          🚧
          <br />
          <small>Waiting for players to join...</small>
          <ul>
            <li>The initial activation of the camera causes a slight delay during the loading of the ML model.</li>
            <li>
              The camera feed is processed locally in the browser, and only the hand coordinates are broadcasted via
              WebSocket.
            </li>
          </ul>
          The source code is available on <a href="https://github.com/SubZtep/virtulala">GitHub</a>.
        </fieldset>
      </Show>
    </>
  )
}
