import * as THREE from "three"
import { createEffect, on, onMount, onCleanup, type Component } from "solid-js"
import { geometries, materials } from "../assets"
import { HAND_CONNECTIONS } from "../const"
import { state, players, myLandmarks } from "../state"

const HandModel: Component<{ pid?: string; scene: THREE.Scene }> = props => {
  const dots = new Map<number, THREE.Mesh>()
  const lines = new Map<number, THREE.Line>()
  let hand: THREE.Group

  onMount(() => {
    hand = new THREE.Group()
    hand.scale.set(-5, -5, -5)

    // create joint dots
    for (let i = 0; i < new Set(HAND_CONNECTIONS.flat()).size; i++) {
      const dot = new THREE.Mesh(geometries.get("dot"), materials.get("dot"))
      dots.set(i, dot)
      hand.add(dot)
    }

    props.scene.add(hand)
  })

  onCleanup(() => {
    lines.forEach(line => props.scene.remove(line))
    dots.forEach(dot => props.scene.remove(dot))
    props.scene.remove(hand)
  })

  const updateLandmarks = (landmarks?: Landmark[]) => {
    if (!landmarks) return

    // move joint dots
    landmarks.forEach(({ x, y, z }, i) => {
      dots.get(i)?.position.set(x, y, z)
    })

    // remove old lines
    lines.forEach(line => props.scene.remove(line))

    // create new lines
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const join = HAND_CONNECTIONS[i]

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...dots.get(join[0])!.position.toArray()),
          new THREE.Vector3(...dots.get(join[1])!.position.toArray()),
        ]),
        materials.get("line")
      )
      line.scale.set(-5, -5, -5)
      lines?.set(i, line)
      props.scene.add(line)
    }
  }

  if (props.pid) {
    createEffect(
      on(
        () => state.lastPlayersUpdate,
        () => updateLandmarks(players.get(props.pid!)?.landmarks)
      )
    )
  } else {
    createEffect(
      on(
        () => state.lastLandmarksUpdate,
        () => updateLandmarks(Array.from(myLandmarks.values()))
      )
    )
  }

  return null
}

export default HandModel
