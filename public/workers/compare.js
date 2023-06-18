/* eslint-disable no-undef */

self.onmessage = function ({ data: { playerIds, threshold, players } }) {
  let similar = true
  const baseAngles = Object.values(players.get(playerIds[0]).angles).flat()

  // Compare the angles of the fingers
  compareLoop: for (const pid of playerIds) {
    const angles = Object.values(players.get(pid).angles).flat()
    for (const angle of baseAngles) {
      if (Math.abs(angle - angles[baseAngles.indexOf(angle)]) > threshold) {
        similar = false
        break compareLoop
      }
    }
  }

  self.postMessage(similar)
}
