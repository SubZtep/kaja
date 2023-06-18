import * as THREE from "three"

export const geometries = new Map<string, THREE.BufferGeometry>([
  ["box", new THREE.BoxGeometry()],
  ["dot", new THREE.SphereGeometry(0.0065, 4, 3)],
])

export const materials = new Map<string, THREE.Material>([
  [
    "box",
    new THREE.MeshPhongMaterial({
      color: 0x000000,
      opacity: 0.12,
      transparent: true,
      side: THREE.DoubleSide,
    }),
  ],
  ["dot", new THREE.MeshPhongMaterial({ color: 0xff0000 })],
  ["line", new THREE.LineBasicMaterial({ color: 0xffff00 })],
])
