import * as THREE from "three"
import { onMount, onCleanup, type Component } from "solid-js"
import { runForever } from "../lib/loop"
import { geometries, materials } from "../assets"

const HandEnvironment: Component<{ scene: THREE.Scene }> = props => {
  let light: THREE.DirectionalLight
  let helper: THREE.DirectionalLightHelper
  let grid: THREE.GridHelper
  let box: THREE.Mesh

  onMount(() => {
    light = new THREE.DirectionalLight()
    light.position.set(0, 10, 0)
    light.target.position.set(0, 5, 0)
    helper = new THREE.DirectionalLightHelper(light)
    grid = new THREE.GridHelper(1, 1)
    // box = new THREE.Mesh(geometries.get("box"), materials.get("box"))

    // runForever.add(deltaTime => {
    //   box.rotation.y += 0.05 * deltaTime
    // })

    // props.scene.add(light, helper, grid, box)
    props.scene.add(light, helper, grid)
  })

  onCleanup(() => {
    // props.scene.remove(light, helper, grid, box)
    props.scene.remove(light, helper, grid)
  })

  return null
}

export default HandEnvironment
