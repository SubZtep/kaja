/* eslint-disable no-undef */

const HAND_ANGLES = [
  [
    "thumb",
    [
      [4, 3, 2],
      [3, 2, 1],
      [2, 1, 0],
    ],
  ],
  [
    "index_finger",
    [
      [8, 7, 6],
      [7, 6, 5],
    ],
  ],
  [
    "middle_finger",
    [
      [12, 11, 10],
      [11, 10, 9],
    ],
  ],
  [
    "ring_finger",
    [
      [16, 15, 14],
      [15, 14, 13],
    ],
  ],
  [
    "pinky",
    [
      [20, 19, 18],
      [19, 18, 17],
    ],
  ],
]

self.onmessage = function ({ data: { message, landmarks } }) {
  message.landmarks = Array.from(landmarks.values())
  message.angles = {}
  for (const [name, values] of HAND_ANGLES) {
    message.angles[name] = values.map(angle => {
      return angleBetween3DCoords(message.landmarks[angle[0]], message.landmarks[angle[1]], message.landmarks[angle[2]])
    })
  }

  self.postMessage(message)
}

/**
 * Calculate angle between 3 points in 3D space.
 * Note: assumes we want 1 vector to run from coord1 (to) coord2, and the other
 * from coord3 (to) coord2.
 *
 * @param coord1 - 1st (3D) coordinate
 * @param coord2 - 2nd (3D) coordinate
 * @param coord3 - 3rd (3D) coordinate
 *
 * @returns Angle between the 3 points
 */
function angleBetween3DCoords(coord1, coord2, coord3) {
  // Calculate vector between points 1 and 2
  const v1 = {
    x: coord1.x - coord2.x,
    y: coord1.y - coord2.y,
    z: coord1.z - coord2.z,
  }

  // Calculate vector between points 2 and 3
  const v2 = {
    x: coord3.x - coord2.x,
    y: coord3.y - coord2.y,
    z: coord3.z - coord2.z,
  }

  // The dot product of vectors v1 & v2 is a function of the cosine of the
  // angle between them (it's scaled by the product of their magnitudes).

  // Normalize v1
  const v1mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z)
  const v1norm = {
    x: v1.x / v1mag,
    y: v1.y / v1mag,
    z: v1.z / v1mag,
  }

  // Normalize v2
  const v2mag = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z)
  const v2norm = {
    x: v2.x / v2mag,
    y: v2.y / v2mag,
    z: v2.z / v2mag,
  }

  // Calculate the dot products of vectors v1 and v2
  const dotProducts = v1norm.x * v2norm.x + v1norm.y * v2norm.y + v1norm.z * v2norm.z

  // Extract the angle from the dot products
  const angle = (Math.acos(dotProducts) * 180.0) / Math.PI

  // Round result to 3 decimal points and return
  return Math.round(angle * 1000) / 1000
}
