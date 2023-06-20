import * as THREE from "three"
import { For, type ParentComponent, type Component } from "solid-js"
import { state, players } from "../state"
import HandEnvironment from "./HandEnvironment"
import HandModel from "./HandModel"
import ThreeScene from "./ThreeScene"
import styles from "./App.module.css"
import { unwrap } from "solid-js/store"

// const Hands: Component<{ scene: THREE.Scene }> = props =>
//   // ["bfcec10a-5005-4495-afa5-84ff1e04a986"].map(pid => <HandModel pid={pid} scene={props.scene} />)
//   unwrap(state.playerIds).map(pid => <HandModel pid={pid} scene={props.scene} />)

const Lobby: Component = () => {
  // const Hands = (scene: THREE.Scene) => state.playerIds.map(pid => <HandModel pid={pid} scene={scene} />)
  // console.log(unwrap(state.playerIds))
  return (
    <ThreeScene colour="#8a0303" background={new THREE.Color(0x000000)} lookAt={[1.2, 0, 0, 0, 0, 0]} class="bg-colour">
      {scene => (
        <>
          <HandEnvironment scene={scene} />
          {/* <Hands scene={scene} /> */}
          {/* {Hands(scene)} */}
          <HandModel pid="bfcec10a-5005-4495-afa5-84ff1e04a986" scene={scene} />
          {/* <For each={unwrap(state.playerIds)}>
          {pid => (
            <HandModel pid={pid} scene={scene} />
          )}
        </For> */}
        </>
      )}
    </ThreeScene>
    // <div style="background: limegreen">
    //   <h1>Lobby</h1>
    //   <For each={state.playerIds}>
    //     {pid => (
    //       <ThreeScene pid={pid} colour={players.get(pid)?.colour}>
    //         {scene => (
    //           <>
    //             <HandEnvironment scene={scene} />
    //             <HandModel pid={pid} scene={scene} />
    //           </>
    //         )}
    //       </ThreeScene>
    //     )}
    //   </For>
    // </div>
  )
}

export default Lobby
