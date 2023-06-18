import { For, Show, Switch, Match } from "solid-js"
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
        <Switch>
          <Match when={state.broadcast}>
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
          </Match>
          <Match when={!state.broadcast}>
            <ThreeScene colour="#009900" bg={0x00ff00} lookAt={[1, 0, 0, 0, 0, 0]} class="stretch bg-colour">
              {scene => (
                <>
                  <HandEnvironment scene={scene} />
                  <HandModel scene={scene} />
                </>
              )}
            </ThreeScene>
            <ThreeScene colour={state.colour} bg={parseInt(state.colour.slice(1), 16)} class="stretch bg-colour">
              {scene => (
                <>
                  <HandEnvironment scene={scene} />
                  <HandModel scene={scene} />
                </>
              )}
            </ThreeScene>
            <ThreeScene colour="#990000" bg={0xff0000} lookAt={[0, 1, 0, 0, 0, 0]} class="stretch bg-colour">
              {scene => (
                <>
                  <HandEnvironment scene={scene} />
                  <HandModel scene={scene} />
                </>
              )}
            </ThreeScene>
            <ThreeScene colour="#000099" bg={0x0000ff} lookAt={[0, 0, 1, 0, 0, 0]} class="stretch bg-colour">
              {scene => (
                <>
                  <HandEnvironment scene={scene} />
                  <HandModel scene={scene} />
                </>
              )}
            </ThreeScene>
          </Match>
        </Switch>
      </div>

      <div class={`${styles.monitor}${state.isDesktop ? " grid-col-span-2" : ""}`}>
        <CameraStream />
      </div>

      <OptionsFieldset />

      <Show when={state.isDesktop}>
        <fieldset class="grid-col-span-2">
          <legend>Readme</legend>
          Lorem ipsum 🚧
          <ul>
            <li>The initial activation of the camera causes a slight delay during the loading of the ML model.</li>
            <li>
              The camera feed is processed locally in the browser, and only the hand coordinates are broadcasted via
              WebSocket.
            </li>
          </ul>
          Source code is available on <a href="https://github.com/SubZtep/kaja">GitHub</a>.
        </fieldset>
      </Show>
    </>
  )
}
