import { useId, useRef, useState } from 'react'
import { uid } from '../../services/strats'
import { abilityGeometry, colorFor, hasLength, isRotatable, shapeFor, shapeLabel } from '../../data/abilityShapes'
import './StratBoard.css'

// Tailles dans le repère 0–1000 de la minimap
export const SIZES = { agent: 30, ability: 21, spike: 18, line: 6, text: 30 }
const SIDE_RING = { attaque: '#ff6170', defense: '#4cc9f0' }

const clamp = (v) => Math.max(0, Math.min(1000, Math.round(v)))

/** Moins de points pour un trait à main levée (Ramer–Douglas–Peucker) */
function simplify(points, eps = 2.5) {
  if (points.length <= 4) return points
  const pts = []
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]])
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = pts[a]
    const [bx, by] = pts[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len
      if (d > max) { max = d; idx = i }
    }
    if (max > eps && idx > 0) {
      keep[idx] = true
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i]).flat()
}

function moveItem(it, dx, dy) {
  if (it.p) return { ...it, p: it.p.map((v, i) => clamp(v + (i % 2 ? dy : dx))) }
  return { ...it, x: clamp(it.x + dx), y: clamp(it.y + dy) }
}

/**
 * Tableau tactique : minimap + éléments posés dessus (SVG, repère 0–1000).
 *
 * tool : 'select' | 'place' | 'line' | 'arrow' | 'draw' | 'zone' | 'text' | 'erase'
 * place : élément à poser quand tool = 'place' ({ t: 'agent', a } …)
 * onChange(items, { selectId }) : appelé à la fin d'un geste (une entrée d'historique)
 */
export default function StratBoard({
  minimap,
  flipped = false,
  side = 'attaque',
  items = [],
  agentByUuid,
  editable = false,
  tool = 'select',
  place = null,
  color = '#ffa043',
  selectedId = null,
  onSelect,
  onChange,
  onPlaced,
  mini = false,
  showNames = false,
  scale = 7,
}) {
  const uidBase = useId().replace(/:/g, '')
  const svgRef = useRef(null)
  const [draft, setDraft] = useState(null) // élément en cours de tracé
  const [drag, setDrag] = useState(null) // { id, sx, sy, dx, dy }
  const [turn, setTurn] = useState(null) // { id, d, l } : capacité qu'on oriente avec la poignée

  const specOf = (it) => (it && it.t === 'ability' ? shapeFor(agentByUuid?.get(it.a)?.name, it.s) : null)
  // Direction (et longueur pour les murs réglables) d'une capacité visée depuis son point de pose
  const aim = (it, spec, px, py) => {
    const dist = Math.hypot(px - it.x, py - it.y)
    if (dist < 6) return { d: it.d ?? -90, l: it.l }
    const d = Math.round((Math.atan2(py - it.y, px - it.x) * 180) / Math.PI)
    if (!hasLength(spec)) return { d, l: it.l }
    let l = dist / scale
    if (spec.k === 'wall' && spec.from === 'center') l *= 2
    if (spec.k === 'rect') l -= spec.off || 0
    l = Math.round(Math.min(spec.max, Math.max(spec.min || 0, l)) * 2) / 2
    return { d, l }
  }

  const toMap = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return flipped ? [clamp(1000 - p.x), clamp(1000 - p.y)] : [clamp(p.x), clamp(p.y)]
  }

  const commit = (next, extra) => onChange && onChange(next, extra || {})

  const onPointerDown = (e) => {
    if (!editable || e.button > 0) return
    const [x, y] = toMap(e)
    const hitId = e.target.closest('[data-id]')?.getAttribute('data-id') || null
    const handleId = e.target.closest('[data-handle]')?.getAttribute('data-handle') || null
    if (handleId) {
      const it = items.find((i) => i.id === handleId)
      if (it) {
        e.currentTarget.setPointerCapture(e.pointerId)
        setTurn({ id: it.id, d: it.d ?? -90, l: it.l })
      }
      return
    }

    if (tool === 'erase') {
      if (hitId) commit(items.filter((it) => it.id !== hitId))
      return
    }
    if (tool === 'select') {
      onSelect && onSelect(hitId)
      if (hitId) {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ id: hitId, sx: x, sy: y, dx: 0, dy: 0 })
      }
      return
    }
    if (tool === 'place' && place) {
      const it = { id: uid(), ...place, x, y }
      const spec = place.t === 'ability' ? shapeFor(agentByUuid?.get(place.a)?.name, place.s) : null
      if (isRotatable(spec)) {
        // On tire pour choisir la direction (et la longueur des murs réglables)
        e.currentTarget.setPointerCapture(e.pointerId)
        setDraft({ ...it, d: -90, l: spec.l, aiming: true })
        return
      }
      commit([...items, it])
      onPlaced && onPlaced(place)
      return
    }
    if (tool === 'text') {
      const it = { id: uid(), t: 'text', x, y, v: 'Texte', c: color }
      commit([...items, it], { selectId: it.id, editText: true })
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'line' || tool === 'arrow') setDraft({ id: uid(), t: 'line', p: [x, y, x, y], c: color, ar: tool === 'arrow' })
    else if (tool === 'draw') setDraft({ id: uid(), t: 'draw', p: [x, y], c: color })
    else if (tool === 'zone') setDraft({ id: uid(), t: 'zone', x, y, r: 0, c: color })
  }

  const onPointerMove = (e) => {
    if (!drag && !draft && !turn) return
    const [x, y] = toMap(e)
    if (turn) {
      const it = items.find((i) => i.id === turn.id)
      if (it) setTurn({ id: it.id, ...aim(it, specOf(it), x, y) })
      return
    }
    if (draft?.aiming) {
      setDraft((d) => ({ ...d, ...aim(d, specOf(d), x, y) }))
      return
    }
    if (drag) {
      setDrag((d) => ({ ...d, dx: x - d.sx, dy: y - d.sy }))
      return
    }
    setDraft((d) => {
      if (!d) return d
      if (d.t === 'line') return { ...d, p: [d.p[0], d.p[1], x, y] }
      if (d.t === 'zone') return { ...d, r: Math.round(Math.hypot(x - d.x, y - d.y)) }
      const lx = d.p[d.p.length - 2]
      const ly = d.p[d.p.length - 1]
      if (Math.hypot(x - lx, y - ly) < 4) return d
      return { ...d, p: [...d.p, x, y] }
    })
  }

  const onPointerUp = () => {
    if (turn) {
      const t = turn
      setTurn(null)
      commit(items.map((it) => (it.id === t.id ? { ...it, d: t.d, ...(t.l != null ? { l: t.l } : {}) } : it)))
      return
    }
    if (draft?.aiming) {
      const { aiming: _a, ...it } = draft
      setDraft(null)
      if (it.l == null) delete it.l
      commit([...items, it])
      onPlaced && onPlaced(place)
      return
    }
    if (drag) {
      const { id, dx, dy } = drag
      setDrag(null)
      if (dx || dy) commit(items.map((it) => (it.id === id ? moveItem(it, dx, dy) : it)))
      return
    }
    if (!draft) return
    const d = draft
    setDraft(null)
    if (d.t === 'line' && Math.hypot(d.p[2] - d.p[0], d.p[3] - d.p[1]) < 8) return
    if (d.t === 'zone' && d.r < 8) return
    if (d.t === 'draw') {
      if (d.p.length < 4) return
      commit([...items, { ...d, p: simplify(d.p) }])
      return
    }
    commit([...items, d])
  }

  const shown = items.map((it) => {
    if (drag && it.id === drag.id) return moveItem(it, drag.dx, drag.dy)
    if (turn && it.id === turn.id) return { ...it, d: turn.d, l: turn.l }
    return it
  })
  if (draft) shown.push(draft)
  // Les icônes restent droites quand la carte est retournée
  const up = (x, y) => (flipped ? `rotate(180 ${x} ${y})` : undefined)
  const ring = SIDE_RING[side] || SIDE_RING.attaque
  const order = { zone: 0, draw: 1, line: 1, ability: 2, spike: 3, agent: 4, text: 5 }
  shown.sort((a, b) => (order[a.t] ?? 9) - (order[b.t] ?? 9))

  return (
    <svg
      ref={svgRef}
      className={`strat-board strat-board--${side}${editable ? ` strat-board--edit strat-board--${tool}` : ''}${mini ? ' strat-board--mini' : ''}`}
      viewBox="0 0 1000 1000"
      role="img"
      aria-label="Tableau tactique"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        {[...new Set(shown.filter((it) => it.t === 'line' && it.ar).map((it) => it.c))].map((c) => (
          <marker key={c} id={`sb-arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" fill={c} />
          </marker>
        ))}
        <clipPath id={`${uidBase}-clip`}><circle r={SIZES.agent - 4} /></clipPath>
        <marker id={`${uidBase}-zarrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 10 5 0 10z" fill="#ffffff" fillOpacity="0.85" />
        </marker>
        <pattern id={`${uidBase}-grid`} width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" className="strat-board__grid" />
        </pattern>
        <radialGradient id={`${uidBase}-vig`} cx="50%" cy="50%" r="70%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <rect width="1000" height="1000" className="strat-board__bg" />
      {!mini && <rect width="1000" height="1000" fill={`url(#${uidBase}-grid)`} />}
      <g transform={flipped ? 'rotate(180 500 500)' : undefined}>
        {minimap && <image href={minimap} x="0" y="0" width="1000" height="1000" className="strat-board__map" />}
        {shown.map((it) => {
          const sel = it.id === selectedId
          const common = { 'data-id': it.id, className: `sb-item${sel ? ' sb-item--sel' : ''}` }
          if (it.t === 'line') {
            const [x1, y1, x2, y2] = it.p
            return (
              <g key={it.id} {...common}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="sb-hit" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={it.c} strokeWidth={SIZES.line} strokeLinecap="round" markerEnd={it.ar ? `url(#sb-arrow-${it.c.slice(1)})` : undefined} />
              </g>
            )
          }
          if (it.t === 'draw') {
            const pts = []
            for (let i = 0; i < it.p.length; i += 2) pts.push(`${it.p[i]},${it.p[i + 1]}`)
            return (
              <g key={it.id} {...common}>
                <polyline points={pts.join(' ')} className="sb-hit" />
                <polyline points={pts.join(' ')} fill="none" stroke={it.c} strokeWidth={SIZES.line} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          }
          if (it.t === 'zone') {
            return <circle key={it.id} {...common} cx={it.x} cy={it.y} r={it.r} fill={it.c} fillOpacity="0.22" stroke={it.c} strokeWidth="4" />
          }
          if (it.t === 'text') {
            return (
              <text key={it.id} {...common} x={it.x} y={it.y} transform={up(it.x, it.y)} fill={it.c} className="sb-text" textAnchor="middle" dominantBaseline="middle">
                {it.v}
              </text>
            )
          }
          if (it.t === 'spike') {
            const s = SIZES.spike
            return (
              <g key={it.id} {...common} transform={`translate(${it.x} ${it.y})${flipped ? ' rotate(180)' : ''}`}>
                {sel && <circle r={s + 14} className="sb-selring" />}
                <path d={`M0 ${-s * 1.3} L${s} 0 L0 ${s * 1.3} L${-s} 0Z`} className="sb-spike" />
                <circle r="4" fill="#fff" />
              </g>
            )
          }
          const agent = agentByUuid?.get(it.a)
          if (it.t === 'ability') {
            const ab = agent?.abilities?.find((x) => x.slot === it.s)
            const r = SIZES.ability
            const spec = specOf(it)
            const geo = abilityGeometry(spec, it, scale)
            const col = colorFor(agent?.name, spec)
            const live = (draft && draft.id === it.id) || (turn && turn.id === it.id)
            return (
              <g key={it.id}>
                <g className={`sb-zone sb-zone--${spec?.cat || 'none'}`} pointerEvents="none">
                  {geo.shapes.map((sh, i) => {
                    if (sh.type === 'circle') {
                      return sh.fill
                        ? <circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={col} className="sb-z-fill" stroke={col} />
                        : <circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={col} className="sb-z-ring" stroke={col} />
                    }
                    if (sh.type === 'path') {
                      const [[x1, y1], [x2, y2]] = sh.pts
                      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} className="sb-z-path" markerEnd={`url(#${uidBase}-zarrow)`} />
                    }
                    return <polygon key={i} points={sh.pts.map((p) => p.join(',')).join(' ')} fill={col} stroke={col} className={sh.solid ? 'sb-z-solid' : 'sb-z-fill'} />
                  })}
                </g>
                {editable && sel && geo.tip && tool === 'select' && (
                  <g data-handle={it.id} className="sb-handle">
                    <line x1={it.x} y1={it.y} x2={geo.tip[0]} y2={geo.tip[1]} />
                    <circle cx={geo.tip[0]} cy={geo.tip[1]} r="13" />
                  </g>
                )}
                {live && geo.tip && (
                  <text x={geo.tip[0]} y={geo.tip[1] - 22} transform={up(geo.tip[0], geo.tip[1] - 22)} className="sb-dim" textAnchor="middle">{shapeLabel(spec, it)}</text>
                )}
              <g {...common} transform={`translate(${it.x} ${it.y})${flipped ? ' rotate(180)' : ''}`}>
                <title>{agent ? `${agent.name} · ${ab?.name || ''}` : 'Capacité'}</title>
                {sel && <circle r={r + 9} className="sb-selring" />}
                <circle r={r} className="sb-ability" stroke={ring} />
                {ab && <image href={ab.icon} x={-r * 0.66} y={-r * 0.66} width={r * 1.32} height={r * 1.32} />}
              </g>
              </g>
            )
          }
          if (it.t === 'agent') {
            const r = SIZES.agent
            return (
              <g key={it.id} {...common} transform={`translate(${it.x} ${it.y})${flipped ? ' rotate(180)' : ''}`}>
                <title>{agent?.name || 'Agent'}</title>
                {sel && <circle r={r + 10} className="sb-selring" />}
                <circle r={r} className="sb-agent" stroke={ring} />
                {agent && <image href={agent.icon} x={-r + 4} y={-r + 4} width={(r - 4) * 2} height={(r - 4) * 2} clipPath={`url(#${uidBase}-clip)`} />}
                {showNames && agent && (
                  <g className="sb-name" transform={`translate(0 ${r + 20})`}>
                    <rect x={-(agent.name.length * 10.4 + 18) / 2} y="-15" width={agent.name.length * 10.4 + 18} height="30" />
                    <text textAnchor="middle" dominantBaseline="central">{agent.name}</text>
                  </g>
                )}
              </g>
            )
          }
          return null
        })}
      </g>
      {!mini && <rect width="1000" height="1000" fill={`url(#${uidBase}-vig)`} pointerEvents="none" />}
    </svg>
  )
}
