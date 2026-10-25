// Image PNG d'une étape de strat (pour l'envoyer sur Discord), dessinée sur un canvas.
import { loadImage } from './exportComposition'
import { SIZES } from '../components/StratBoard/StratBoard'
import { abilityGeometry, colorFor, mapScale, shapeFor } from '../data/abilityShapes'
import { boardRotation, boardView, loadCrop } from './mapView'

const W = 1080
const HEAD = 120
const FONT_DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif'
const FONT_MONO = '"JetBrains Mono", monospace'
const RING = { attaque: '#ff6170', defense: '#4cc9f0' }

export async function renderStratPng({ map, strat, step, agentByUuid, showNames = true }) {
  // Même orientation et même cadrage que sur le tableau
  const rot = boardRotation(map, strat.side)
  const view = boardView(rot, await loadCrop(map?.minimap))
  const k = W / view.w
  const H = Math.round(view.h * k)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H + HEAD
  const ctx = canvas.getContext('2d')
  const ring = RING[strat.side] || RING.attaque

  // Images nécessaires (minimap, agents, capacités)
  const urls = new Set([map?.minimap])
  step.items.forEach((it) => {
    const a = agentByUuid.get(it.a)
    if (it.t === 'agent' && a) urls.add(a.icon)
    if (it.t === 'ability' && a) urls.add(a.abilities?.find((x) => x.slot === it.s)?.icon)
  })
  const imgs = new Map()
  await Promise.all([...urls].filter(Boolean).map(async (u) => imgs.set(u, await loadImage(u))))
  if (document.fonts?.ready) await document.fonts.ready

  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, W, H + HEAD)
  ctx.fillStyle = '#ffa043'
  ctx.fillRect(0, HEAD - 4, W, 4)
  ctx.fillStyle = '#9aa3af'
  ctx.font = `500 22px ${FONT_MONO}`
  ctx.fillText(`${(map?.name || '').toUpperCase()} · ${strat.side === 'defense' ? 'DÉFENSE' : 'ATTAQUE'} · ${step.name.toUpperCase()}`, 36, 44)
  ctx.fillStyle = '#eef0f3'
  ctx.font = `900 52px ${FONT_DISPLAY}`
  ctx.fillText(strat.name.toUpperCase(), 36, 96)
  ctx.fillStyle = '#7d8794'
  ctx.font = `500 18px ${FONT_MONO}`
  ctx.textAlign = 'right'
  ctx.fillText('PRIZM COMP BUILDER', W - 36, 44)
  ctx.textAlign = 'left'

  ctx.save()
  ctx.translate(0, HEAD)
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.clip()
  ctx.translate(-view.x * k, -view.y * k)
  ctx.translate(500 * k, 500 * k)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.translate(-500 * k, -500 * k)
  const mm = imgs.get(map?.minimap)
  if (mm) ctx.drawImage(mm, 0, 0, 1000 * k, 1000 * k)
  const upright = (x, y, draw) => {
    ctx.save()
    ctx.translate(x * k, y * k)
    if (rot) ctx.rotate((-rot * Math.PI) / 180)
    draw()
    ctx.restore()
  }
  const order = { zone: 0, draw: 1, line: 1, ability: 2, spike: 3, agent: 4, text: 5 }
  const items = [...step.items].sort((a, b) => (order[a.t] ?? 9) - (order[b.t] ?? 9))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const it of items) {
    if (it.t === 'zone') {
      ctx.beginPath()
      ctx.arc(it.x * k, it.y * k, it.r * k, 0, Math.PI * 2)
      ctx.globalAlpha = 0.22
      ctx.fillStyle = it.c
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 4 * k
      ctx.strokeStyle = it.c
      ctx.stroke()
    } else if (it.t === 'line' || it.t === 'draw') {
      ctx.beginPath()
      ctx.moveTo(it.p[0] * k, it.p[1] * k)
      for (let i = 2; i < it.p.length; i += 2) ctx.lineTo(it.p[i] * k, it.p[i + 1] * k)
      ctx.lineWidth = SIZES.line * k
      ctx.strokeStyle = it.c
      ctx.stroke()
      if (it.t === 'line' && it.ar) {
        const [x1, y1, x2, y2] = it.p.map((v) => v * k)
        const ang = Math.atan2(y2 - y1, x2 - x1)
        const s = 20 * k
        ctx.beginPath()
        ctx.moveTo(x2 + Math.cos(ang) * s * 0.6, y2 + Math.sin(ang) * s * 0.6)
        ctx.lineTo(x2 + Math.cos(ang + 2.5) * s, y2 + Math.sin(ang + 2.5) * s)
        ctx.lineTo(x2 + Math.cos(ang - 2.5) * s, y2 + Math.sin(ang - 2.5) * s)
        ctx.closePath()
        ctx.fillStyle = it.c
        ctx.fill()
      }
    } else if (it.t === 'ability' || it.t === 'agent') {
      const a = agentByUuid.get(it.a)
      if (it.t === 'ability') drawZone(ctx, k, shapeFor(a?.name, it.s), it, mapScale(map), colorFor(a?.name, shapeFor(a?.name, it.s)))
      const r = (it.t === 'agent' ? SIZES.agent : SIZES.ability) * k
      const icon = it.t === 'agent' ? a?.icon : a?.abilities?.find((x) => x.slot === it.s)?.icon
      upright(it.x, it.y, () => {
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fillStyle = '#0d1117'
        ctx.fill()
        ctx.lineWidth = (it.t === 'agent' ? 5 : 3) * k
        ctx.strokeStyle = ring
        ctx.stroke()
        const im = imgs.get(icon)
        if (im) {
          if (it.t === 'agent') {
            ctx.save()
            ctx.beginPath()
            ctx.arc(0, 0, r - 3 * k, 0, Math.PI * 2)
            ctx.clip()
            ctx.drawImage(im, -r + 3 * k, -r + 3 * k, (r - 3 * k) * 2, (r - 3 * k) * 2)
            ctx.restore()
            if (showNames && a) {
              ctx.font = `700 ${19 * k}px "Instrument Sans", sans-serif`
              const w = ctx.measureText(a.name).width + 18 * k
              ctx.fillStyle = 'rgba(8,10,14,0.86)'
              ctx.fillRect(-w / 2, r + 5 * k, w, 30 * k)
              ctx.fillStyle = '#eef0f3'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(a.name, 0, r + 20 * k)
            }
          } else {
            ctx.drawImage(im, -r * 0.68, -r * 0.68, r * 1.36, r * 1.36)
          }
        }
      })
    } else if (it.t === 'spike') {
      const s = SIZES.spike * k
      upright(it.x, it.y, () => {
        ctx.beginPath()
        ctx.moveTo(0, -s * 1.3)
        ctx.lineTo(s, 0)
        ctx.lineTo(0, s * 1.3)
        ctx.lineTo(-s, 0)
        ctx.closePath()
        ctx.fillStyle = '#ff4655'
        ctx.fill()
        ctx.lineWidth = 3 * k
        ctx.strokeStyle = '#fff'
        ctx.stroke()
      })
    } else if (it.t === 'text') {
      upright(it.x, it.y, () => {
        ctx.font = `800 ${SIZES.text * k}px ${FONT_DISPLAY}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 7 * k
        ctx.strokeStyle = 'rgba(5,7,10,0.9)'
        ctx.strokeText(String(it.v).toUpperCase(), 0, 0)
        ctx.fillStyle = it.c
        ctx.fillText(String(it.v).toUpperCase(), 0, 0)
      })
    }
  }
  ctx.restore()

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Zone réelle d'une capacité (mêmes formes que sur le tableau)
function drawZone(ctx, k, spec, it, scale, col) {
  if (!spec) return
  const { shapes } = abilityGeometry(spec, it, scale)
  ctx.save()
  for (const sh of shapes) {
    ctx.beginPath()
    if (sh.type === 'circle') ctx.arc(sh.cx * k, sh.cy * k, sh.r * k, 0, Math.PI * 2)
    else {
      sh.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)))
      if (sh.type !== 'path') ctx.closePath()
    }
    ctx.strokeStyle = col
    ctx.fillStyle = col
    if (sh.type === 'path') {
      ctx.setLineDash([3 * k, 9 * k])
      ctx.lineWidth = 4 * k
      ctx.globalAlpha = 0.9
      ctx.stroke()
      ctx.setLineDash([])
      continue
    }
    const ring = sh.type === 'circle' && !sh.fill
    ctx.globalAlpha = ring ? 0.05 : sh.solid ? 0.85 : spec.cat === 'smoke' ? 0.5 : 0.24
    ctx.fill()
    ctx.globalAlpha = 0.9
    ctx.lineWidth = 2.5 * k
    if (ring) ctx.setLineDash([10 * k, 8 * k])
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
}
