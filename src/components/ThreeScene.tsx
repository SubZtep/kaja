import * as THREE from "three"
import CameraControls from "camera-controls"
import { type Component, type JSX, onMount, onCleanup, mergeProps } from "solid-js"
import { runForever } from "../lib/loop"

CameraControls.install({ THREE })

const ThreeScene: Component<{
  pid?: string
  colour?: string
  background?: THREE.Color
  lookAt?: [number, number, number, number, number, number]
  /** CSS class name */
  class?: string
  children: (scene: THREE.Scene) => JSX.Element
}> = rawProps => {
  const props = mergeProps({ colour: "#f3f6f9", lookAt: [1, 1, 1, 0, 0, 0] }, rawProps)
  const scene = new THREE.Scene()
  let camera: THREE.PerspectiveCamera
  let renderer: THREE.WebGLRenderer
  let controls: CameraControls
  let resizer: ResizeObserver
  let canvas: HTMLCanvasElement | undefined

  onMount(() => {
    setTimeout(() => {
      if (props.pid) {
        canvas!.dataset.pid = props.pid
      }
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
      })

      const width = canvas!.clientWidth
      const height = canvas!.clientHeight

      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(width, height)

      if (props.background) {
        scene.background = props.background
      }

      camera = new THREE.PerspectiveCamera(60, undefined, 0.01, 100)
      camera.aspect = width / height
      camera.updateProjectionMatrix()

      controls = new CameraControls(camera, renderer.domElement)
      // @ts-ignore
      controls.setLookAt(...props.lookAt, false)

      runForever.add(delta => {
        controls.update(delta)
        renderer.render(scene, camera)
      })

      // setTimeout(() => {
      //   const width = canvas!.clientWidth
      //   const height = canvas!.clientHeight

      //   // console.log([width, height])
      //   canvas!.setAttribute("width", width.toString())
      //   canvas!.setAttribute("height", height.toString())
      //   // const width = canvas!.clientWidth / 4
      //   // const height = canvas!.clientHeight / 4
      //   // renderer.setSize(width, height, false)
      //   camera.aspect = width / height
      //   camera.updateProjectionMatrix()
      // }, 1000)

      resizer = new ResizeObserver(() => {
        const width = canvas!.clientWidth
        const height = canvas!.clientHeight
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      })

      resizer.observe(canvas!, { box: "content-box" })
    }, 100)
  })

  onCleanup(() => {
    resizer?.disconnect()
  })

  return (
    <>
      <canvas
        ref={canvas}
        style={`--colour: ${props.colour}`}
        class={`${props.class ? ` ${props.class}` : ""}`}
      ></canvas>
      {props.children(scene)}
    </>
  )
}

export default ThreeScene
