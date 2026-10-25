// Cadrage et orientation de la minimap sur le tableau tactique.
// - La minimap officielle a beaucoup de vide autour : on cadre sur la partie dessinée
//   (pixels non transparents), pour que la carte soit aussi grande que possible.
// - On la tourne pour que ton spawn soit en bas : attaquants en bas en attaque,
//   défenseurs en bas en défense (rotation de base fournie par l'API + 180° en défense).
import { useEffect, useState } from 'react'

const cache = new Map()

/** Zone dessinée de la minimap, dans le repère 0–1000 (null si l'image ne se lit pas). */
export function loadCrop(url) {
  if (!url) return Promise.resolve(null)
  if (cache.has(url)) return cache.get(url)
  const p = new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const N = 200
        const c = document.createElement('canvas')
        c.width = N
        c.height = N
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, N, N)
        const d = ctx.getImageData(0, 0, N, N).data
        let x0 = N, y0 = N, x1 = -1, y1 = -1
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            if (d[(y * N + x) * 4 + 3] > 24) {
              if (x < x0) x0 = x
              if (x > x1) x1 = x
              if (y < y0) y0 = y
              if (y > y1) y1 = y
            }
          }
        }
        if (x1 < 0) return resolve(null)
        const k = 1000 / N
        resolve({ x0: x0 * k, y0: y0 * k, x1: (x1 + 1) * k, y1: (y1 + 1) * k })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
  cache.set(url, p)
  return p
}

export function useMapCrop(url) {
  const [crop, setCrop] = useState(() => null)
  useEffect(() => {
    let alive = true
    loadCrop(url).then((c) => alive && setCrop(c))
    return () => { alive = false }
  }, [url])
  return crop
}

/** Rotation à appliquer : ton spawn en bas. */
export function boardRotation(map, side) {
  return (((map?.rot || 0) + (side === 'defense' ? 180 : 0)) % 360 + 360) % 360
}

const rotPt = (x, y, deg) => {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [500 + (x - 500) * c - (y - 500) * s, 500 + (x - 500) * s + (y - 500) * c]
}

/** Fenêtre affichée (repère tourné), avec une petite marge autour de la carte. */
export function boardView(rotation, crop, margin = 28) {
  if (!crop) return { x: 0, y: 0, w: 1000, h: 1000 }
  const pts = [[crop.x0, crop.y0], [crop.x1, crop.y0], [crop.x1, crop.y1], [crop.x0, crop.y1]].map(([x, y]) => rotPt(x, y, rotation))
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.max(-200, Math.min(...xs) - margin)
  const y = Math.max(-200, Math.min(...ys) - margin)
  return { x, y, w: Math.max(...xs) + margin - x, h: Math.max(...ys) + margin - y }
}

/** Point de l'écran (repère tourné) → point de la carte (repère 0–1000). */
export function unrotate(x, y, rotation) {
  return rotPt(x, y, -rotation)
}
