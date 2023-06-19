import * as THREE from "three"
import throttle from "lodash/throttle"
import CameraControls from "camera-controls"
import { type Component, type JSX, onMount, onCleanup, mergeProps } from "solid-js"
import { runForever } from "../lib/loop"

CameraControls.install({ THREE })

const ThreeScene: Component<{
  pid?: string
  colour?: string
  background?: THREE.Color
  alpha?: boolean
  lookAt?: [number, number, number, number, number, number]
  /** CSS class name */
  class?: string
  rotate?: boolean
  children: (scene: THREE.Scene) => JSX.Element
}> = rawProps => {
  const props = mergeProps({ colour: "#f3f6f9", lookAt: [1, 1, 1, 0, 0, 0], alpha: false }, rawProps)

  const scene = new THREE.Scene()
  let camera: THREE.PerspectiveCamera
  let renderer: THREE.WebGLRenderer
  let controls: CameraControls
  let resizer: ResizeObserver
  let wrapper: HTMLDivElement | undefined

  renderer = new THREE.WebGLRenderer({ alpha: props.alpha, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)

  if (props.background) {
    scene.background = props.background
  }

  camera = new THREE.PerspectiveCamera(60, undefined, 0.01, 100)

  onMount(() => {
    let { clientWidth: w, clientHeight: h } = wrapper!
    renderer.setSize(w, h)

    const canvas = wrapper?.appendChild(renderer.domElement)

    controls = new CameraControls(camera, canvas)
    // @ts-ignore
    controls.setLookAt(...props.lookAt, false)
    if (props.rotate) {
      runForever.add(deltaTime => {
        controls.azimuthAngle += 3 * deltaTime * THREE.MathUtils.DEG2RAD
      })
    }

    runForever.add(delta => {
      controls.update(delta)
      renderer.render(scene, camera)
    })

    resizer = new ResizeObserver(
      throttle(() => {
        w = wrapper!.clientWidth - 4
        h = wrapper!.clientHeight - 4
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }, 300)
    )

    resizer.observe(wrapper!, { box: "content-box" })
  })

  onCleanup(() => {
    resizer?.disconnect()
  })

  return (
    <div ref={wrapper} data-pid={props.pid} style={`--colour: ${props.colour}`} class={props.class}>
      {props.children(scene)}
    </div>
  )
}

export default ThreeScene
