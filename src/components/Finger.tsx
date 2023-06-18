import { createEffect, createSignal, on, For, Show, type Component, type ParentComponent } from "solid-js"
import { unwrap } from "solid-js/store"
import { state, players } from "../state"
import styles from "./App.module.css"

const DisplayFinger: Component<{ pid: string; name: string }> = props => {
  const [angles, setAngles] = createSignal<number[]>()

  createEffect(
    on(
      () => state.lastPlayersUpdate,
      () => {
        const v = players.get(props.pid)?.angles?.[props.name]
        if (v) setAngles(unwrap(v))
      }
    )
  )

  return (
    <div class={styles.fingerMeters}>
      <For each={angles()}>
        {item => (
          <progress
            max="150"
            value={~~(item - 50)}
            data-pid={props.pid}
            style={`--colour: ${players.get(props.pid)!.colour};`}
          ></progress>
        )}
      </For>
    </div>
  )
}

const Finger: ParentComponent<{ name: string }> = props => {
  return (
    <fieldset class={styles.finger}>
      <legend>{props.name.replace("_", " ")}</legend>

      <div class={`flex-row ${styles.fingerMeters}`}>
        <For each={state.playerIds}>
          {pid => (
            <div class="flex-col">
              <small>{pid}</small>
              <DisplayFinger pid={pid} name={props.name} />
            </div>
          )}
        </For>
        <Show when={state.playerIds.length === 0}>
          <progress class="opacity-10"></progress>
        </Show>
      </div>
    </fieldset>
  )
}

export default Finger
