import * as THREE from "three"
import CameraControls from "camera-controls"
import { type Component, type JSX, onMount, onCleanup, mergeProps } from "solid-js"
import { runForever } from "../lib/loop"

CameraControls.install({ THREE })

const ThreeScene: Component<{
  pid?: string
  colour?: string
  translucent?: boolean
  /** CSS class name */
  class?: string
  children: (scene: THREE.Scene) => JSX.Element
}> = rawProps => {
  const props = mergeProps({ colour: "#f3f6f9" }, rawProps)
  const scene = new THREE.Scene()
  let camera: THREE.PerspectiveCamera
  let renderer: THREE.WebGLRenderer
  let controls: CameraControls
  let resizer: ResizeObserver
  let canvas: HTMLCanvasElement | undefined

  onMount(() => {
    if (props.pid) {
      canvas!.dataset.pid = props.pid
    }
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
    })
    renderer.setPixelRatio(window.devicePixelRatio)

    camera = new THREE.PerspectiveCamera(60, undefined, 0.01, 100)

    controls = new CameraControls(camera, renderer.domElement)
    controls.setLookAt(0, 0, 2, 0, 0, 0, false)

    runForever.add(delta => {
      controls.update(delta)
      renderer.render(scene, camera)
    })

    resizer = new ResizeObserver(() => {
      const width = canvas!.clientWidth
      const height = canvas!.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    })

    resizer.observe(canvas!, { box: "content-box" })
  })

  onCleanup(() => {
    resizer.disconnect()
  })

  return (
    <>
      <canvas
        ref={canvas}
        style={`--colour: ${props.colour}${props.translucent ? "69" : ""}`}
        class={`stretch${props.class ? ` ${props.class}` : ""}`}
      ></canvas>
      {props.children(scene)}
    </>
  )
}

export default ThreeScene
