import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { uid } from '../../services/strats'
import { unrotate } from '../../utils/mapView'
import { abilityGeometry, colorFor, hasLength, isRotatable, shapeFor, shapeLabel } from '../../data/abilityShapes'
import { SPIKE } from '../../data/spikeGlyph'
import './StratBoard.css'

// Tailles dans le repère 0–1000 de la minimap
export const SIZES = { agent: 22, ability: 17, spike: 20, line: 6, text: 30 }
export const SIDE_COLORS = { attaque: '#ff6170', defense: '#4cc9f0' }
const SIDE_RING = SIDE_COLORS
const MOVE_MS = 750
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Même élément d'une étape à l'autre (les copies d'étape ont de nouveaux identifiants)
function matchKey(it) {
  if (it.t === 'agent') return `a:${it.a}:${it.en ? 1 : 0}`
  if (it.t === 'ability') return `b:${it.a}:${it.s}:${it.en ? 1 : 0}`
  if (it.t === 'spike') return 'spike'
  if (it.t === 'text') return `t:${it.v}`
  return null
}

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
  rotation = 0,
  view = null, // { x, y, w, h } : partie de la carte affichée (repère tourné)
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
  stepKey = null, // change d'étape → les éléments glissent vers leur nouvelle place
}) {
  const uidBase = useId().replace(/:/g, '')
  const svgRef = useRef(null)
  const [draft, setDraft] = useState(null) // élément en cours de tracé
  const [drag, setDrag] = useState(null) // { id, sx, sy, dx, dy }
  const [turn, setTurn] = useState(null) // { id, d, l } : capacité qu'on oriente avec la poignée
  const [zoomView, setZoomView] = useState(null) // partie affichée quand on a zoomé (null = carte entière)
  const [pan, setPan] = useState(null) // { cx, cy, x, y } : déplacement de la vue en cours
  // Plein écran : la vue s'étend à la forme de la zone disponible (la carte reste centrée)
  const wrapRef = useRef(null)
  const [box, setBox] = useState(null)
  // Transition entre deux étapes : chaque agent « marche » de son ancienne place à la nouvelle
  const lastRef = useRef({ key: stepKey, items })
  const [anim, setAnim] = useState(null) // { from: Map(id → ancien élément), fresh: Set(id), t }
  useLayoutEffect(() => {
    const prev = lastRef.current
    if (stepKey == null || prev.key === stepKey) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const pool = new Map()
    prev.items.forEach((it) => {
      const k = matchKey(it)
      if (!k) return
      if (!pool.has(k)) pool.set(k, [])
      pool.get(k).push(it)
    })
    const from = new Map()
    const fresh = new Set()
    items.forEach((it) => {
      const k = matchKey(it)
      const src = k ? pool.get(k)?.shift() : null
      if (src) { if (src.x !== it.x || src.y !== it.y || src.d !== it.d) from.set(it.id, src) } else fresh.add(it.id)
    })
    if (!from.size && !fresh.size) { setAnim(null); return undefined }
    let raf = 0
    const t0 = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / MOVE_MS)
      if (t >= 1) { setAnim(null); return }
      setAnim({ from, fresh, t })
      raf = requestAnimationFrame(tick)
    }
    setAnim({ from, fresh, t: 0 })
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stepKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { lastRef.current = { key: stepKey, items } })
  useEffect(() => {
    const el = wrapRef.current
    if (!el || mini) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setBox((b) => (b && Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mini])
  const fitted = view || { x: 0, y: 0, w: 1000, h: 1000 }
  const base = (() => {
    if (!box) return fitted
    const a = box.w / box.h
    if (fitted.w / fitted.h < a) {
      const w = fitted.h * a
      return { x: fitted.x - (w - fitted.w) / 2, y: fitted.y, w, h: fitted.h }
    }
    const h = fitted.w / a
    return { x: fitted.x, y: fitted.y - (h - fitted.h) / 2, w: fitted.w, h }
  })()
  const baseKey = `${base.x}|${base.y}|${base.w}|${base.h}`
  const [lastKey, setLastKey] = useState(baseKey)
  if (lastKey !== baseKey) {
    // Nouvelle carte ou autre côté : on revient à la vue entière
    setLastKey(baseKey)
    setZoomView(null)
  }
  const vb = zoomView || base
  const zoom = base.w / vb.w

  // Garde la vue dans les limites de la carte
  const fit = (v) => {
    const w = Math.min(base.w, Math.max(base.w / 5, v.w))
    const h = (w / base.w) * base.h
    const x = Math.min(base.x + base.w - w, Math.max(base.x, v.x))
    const y = Math.min(base.y + base.h - h, Math.max(base.y, v.y))
    return w >= base.w - 0.5 ? null : { x, y, w, h }
  }
  // Zoom autour d'un point (repère de la vue)
  const zoomAt = (px, py, factor) => {
    const w = vb.w / factor
    const h = vb.h / factor
    setZoomView(fit({ x: px - ((px - vb.x) / vb.w) * w, y: py - ((py - vb.y) / vb.h) * h, w, h }))
  }
  const toView = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }
  // Molette : zoom (écouteur non passif pour bloquer le défilement de la page)
  const wheelRef = useRef(null)
  useEffect(() => {
    wheelRef.current = (e) => {
      e.preventDefault()
      const p = toView(e)
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.2 : 1 / 1.2)
    }
  })
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || mini) return undefined
    const h = (e) => wheelRef.current(e)
    svg.addEventListener('wheel', h, { passive: false })
    return () => svg.removeEventListener('wheel', h)
  }, [mini])

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
    const [mx, my] = unrotate(p.x, p.y, rotation)
    return [clamp(mx), clamp(my)]
  }

  const commit = (next, extra) => onChange && onChange(next, extra || {})

  const startPan = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setPan({ cx: e.clientX, cy: e.clientY, x: vb.x, y: vb.y })
  }

  const onPointerDown = (e) => {
    if (mini) return
    const hitId = e.target.closest('[data-id]')?.getAttribute('data-id') || null
    // Clic molette / clic droit, ou fond de carte quand on a zoomé : on déplace la vue
    if (e.button === 1 || e.button === 2 || (zoom > 1.01 && !hitId && (!editable || tool === 'select') && !e.target.closest('[data-handle]'))) {
      e.preventDefault()
      if (editable && tool === 'select' && e.button === 0) onSelect && onSelect(null)
      startPan(e)
      return
    }
    if (!editable || e.button > 0) return
    const [x, y] = toMap(e)
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
    if (pan) {
      const r = svgRef.current.getBoundingClientRect()
      const k = vb.w / r.width
      setZoomView(fit({ ...vb, x: pan.x - (e.clientX - pan.cx) * k, y: pan.y - (e.clientY - pan.cy) * k }))
      return
    }
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
    if (pan) {
      setPan(null)
      return
    }
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
    if (anim) {
      const e = ease(anim.t)
      const f = anim.from.get(it.id)
      if (f) {
        const lerp = (a, b) => (a == null || b == null ? b : a + (b - a) * e)
        return { ...it, x: lerp(f.x, it.x), y: lerp(f.y, it.y), d: it.d != null && f.d != null ? lerp(f.d, it.d) : it.d }
      }
      if (anim.fresh.has(it.id)) return { ...it, _o: Math.min(1, anim.t * 1.6) }
      if (!matchKey(it)) return { ...it, _o: Math.min(1, anim.t * 1.6) }
    }
    if (drag && it.id === drag.id) return moveItem(it, drag.dx, drag.dy)
    if (turn && it.id === turn.id) return { ...it, d: turn.d, l: turn.l }
    return it
  })
  if (draft) shown.push(draft)
  // Les icônes restent droites quand la carte est retournée
  const up = (x, y) => (rotation ? `rotate(${-rotation} ${x} ${y})` : undefined)
  const ring = SIDE_RING[side] || SIDE_RING.attaque
  const ringEnemy = side === 'defense' ? SIDE_RING.attaque : SIDE_RING.defense
  const order = { zone: 0, draw: 1, line: 1, ability: 2, spike: 3, agent: 4, text: 5 }
  shown.sort((a, b) => (order[a.t] ?? 9) - (order[b.t] ?? 9))

  const svg = (
    <svg
      ref={svgRef}
      className={`strat-board strat-board--${side}${editable ? ` strat-board--edit strat-board--${tool}` : ''}${mini ? ' strat-board--mini' : ''}`}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={mini ? { aspectRatio: `${base.w} / ${base.h}` } : undefined}
      onContextMenu={(e) => e.preventDefault()}
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
        <clipPath id={`${uidBase}-clip`}><circle r={SIZES.agent - 3} /></clipPath>
        <marker id={`${uidBase}-zarrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 10 5 0 10z" fill="#ffffff" fillOpacity="0.85" />
        </marker>
      </defs>
      <g transform={rotation ? `rotate(${rotation} 500 500)` : undefined}>
        {minimap && <image href={minimap} x="0" y="0" width="1000" height="1000" className="strat-board__map" />}
        {shown.map((it) => {
          const sel = it.id === selectedId
          const common = { 'data-id': it.id, className: `sb-item${sel ? ' sb-item--sel' : ''}`, style: it._o != null ? { opacity: it._o } : undefined }
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
              <g key={it.id} {...common} transform={`translate(${it.x} ${it.y})${rotation ? ` rotate(${-rotation})` : ''}`}>
                <title>Spike</title>
                {sel && <circle r={s * SPIKE.r + 10} className="sb-selring" />}
                <circle r={s * SPIKE.r} className="sb-spike" />
                <g transform={`scale(${s})`} className="sb-spike__glyph">
                  <path d={SPIKE.fins} fill={SPIKE.dark} stroke={SPIKE.red} strokeWidth={0.07} strokeLinejoin="round" />
                  <path d={SPIKE.body} fill={SPIKE.dark} stroke={SPIKE.red} strokeWidth={0.08} strokeLinejoin="round" />
                  <path d={SPIKE.cap} fill="#c9ced6" />
                  <path d={SPIKE.core} fill={SPIKE.red} className="sb-spike__core" />
                </g>
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
            const onZone = spec?.k === 'circle'
            const ri = onZone ? Math.max(11, Math.min(r, spec.r * scale * 0.55)) : r
            return (
              <g key={it.id}>
                <Zone id={`${uidBase}-${it.id}`} arrow={`${uidBase}-zarrow`} spec={spec} geo={geo} col={col} />
                {editable && sel && geo.tip && tool === 'select' && (
                  <g data-handle={it.id} className="sb-handle">
                    <line x1={it.x} y1={it.y} x2={geo.tip[0]} y2={geo.tip[1]} />
                    <circle cx={geo.tip[0]} cy={geo.tip[1]} r="13" />
                  </g>
                )}
                {live && geo.tip && (
                  <text x={geo.tip[0]} y={geo.tip[1] - 22} transform={up(geo.tip[0], geo.tip[1] - 22)} className="sb-dim" textAnchor="middle">{shapeLabel(spec, it)}</text>
                )}
              <g {...common} transform={`translate(${it.x} ${it.y})${rotation ? ` rotate(${-rotation})` : ''}`}>
                <title>{agent ? `${agent.name} · ${ab?.name || ''}` : 'Capacité'}</title>
                {sel && <circle r={ri + 9} className="sb-selring" />}
                {/* Sur une zone ronde (smoke, molly…), l'icône est plus discrète pour laisser voir la zone */}
                <circle r={ri} className={`sb-ability${onZone ? ' sb-ability--onzone' : ''}`} stroke={it.en ? ringEnemy : ring} />
                {ab && <image href={ab.icon} x={-ri * 0.66} y={-ri * 0.66} width={ri * 1.32} height={ri * 1.32} />}
              </g>
              </g>
            )
          }
          if (it.t === 'agent') {
            const r = SIZES.agent
            return (
              <g key={it.id} {...common} transform={`translate(${it.x} ${it.y})${rotation ? ` rotate(${-rotation})` : ''}`}>
                <title>{agent?.name || 'Agent'}</title>
                {sel && <circle r={r + 10} className="sb-selring" />}
                <circle r={r} className={`sb-agent${it.en ? ' sb-agent--enemy' : ''}`} stroke={it.en ? ringEnemy : ring} />
                {agent && <image href={agent.icon} x={-r + 3} y={-r + 3} width={(r - 3) * 2} height={(r - 3) * 2} clipPath={`url(#${uidBase}-clip)`} />}
                {showNames && agent && (
                  <g className="sb-name" transform={`translate(0 ${r + 16})`}>
                    <rect x={-(agent.name.length * 9 + 16) / 2} y="-13" width={agent.name.length * 9 + 16} height="26" />
                    <text textAnchor="middle" dominantBaseline="central">{agent.name}</text>
                  </g>
                )}
              </g>
            )
          }
          return null
        })}
      </g>
    </svg>
  )
  if (mini) return svg
  return (
    <div ref={wrapRef} className={`sb-wrap${pan ? ' sb-wrap--pan' : ''}${zoom > 1.01 ? ' sb-wrap--zoomed' : ''}`}>
      {svg}
      <div className="sb-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1.35)} aria-label="Zoomer" title="Zoomer (molette)">+</button>
        <button type="button" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1 / 1.35)} disabled={zoom <= 1.01} aria-label="Dézoomer" title="Dézoomer (molette)">−</button>
        <button type="button" className="sb-zoom__fit" onClick={() => setZoomView(null)} disabled={zoom <= 1.01} title="Voir toute la carte">Ajuster</button>
        {zoom > 1.01 && <span>×{zoom.toFixed(1).replace('.', ',')}</span>}
      </div>
    </div>
  )
}

// Rendu d'une zone de capacité, au plus près du jeu : nuage pour les smokes,
// cœur brûlant pour les mollys, hachures pour les slows, mur plein, fil tendu…
function Zone({ id, arrow, spec, geo, col }) {
  if (!spec || !geo.shapes.length) return null
  const cat = spec.cat
  const defs = []
  const out = []
  geo.shapes.forEach((sh, i) => {
    const gid = `${id}-${i}`
    if (sh.type === 'circle' && sh.fill) {
      if (cat === 'smoke') {
        defs.push(
          <radialGradient key={gid} id={gid}>
            <stop offset="0%" stopColor={col} stopOpacity="0.82" />
            <stop offset="72%" stopColor={col} stopOpacity="0.66" />
            <stop offset="100%" stopColor={col} stopOpacity="0.5" />
          </radialGradient>
        )
        out.push(<circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={`url(#${gid})`} stroke={col} strokeWidth="3" strokeOpacity="0.95" className="sb-z-smoke" />)
      } else if (cat === 'fire' || cat === 'damage') {
        defs.push(
          <radialGradient key={gid} id={gid}>
            <stop offset="0%" stopColor="#fff2c2" stopOpacity="0.7" />
            <stop offset="35%" stopColor={col} stopOpacity="0.62" />
            <stop offset="100%" stopColor={col} stopOpacity="0.32" />
          </radialGradient>
        )
        out.push(<circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={`url(#${gid})`} stroke={col} strokeWidth="2.5" />)
      } else if (cat === 'slow') {
        defs.push(
          <pattern key={gid} id={gid} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="9" fill={col} fillOpacity="0.16" />
            <line x1="0" y1="0" x2="0" y2="9" stroke={col} strokeWidth="3" strokeOpacity="0.55" />
          </pattern>
        )
        out.push(<circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={`url(#${gid})`} stroke={col} strokeWidth="2.5" />)
      } else {
        defs.push(
          <radialGradient key={gid} id={gid}>
            <stop offset="0%" stopColor={col} stopOpacity="0.14" />
            <stop offset="100%" stopColor={col} stopOpacity="0.45" />
          </radialGradient>
        )
        out.push(<circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={`url(#${gid})`} stroke={col} strokeWidth="2.5" />)
      }
    } else if (sh.type === 'circle') {
      // Rayon de détection / révélation : contour en pointillés, voile léger vers le bord
      defs.push(
        <radialGradient key={gid} id={gid}>
          <stop offset="55%" stopColor={col} stopOpacity="0" />
          <stop offset="100%" stopColor={col} stopOpacity="0.16" />
        </radialGradient>
      )
      out.push(<circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill={`url(#${gid})`} stroke={col} strokeWidth="2.5" strokeDasharray="12 8" strokeOpacity="0.9" />)
    } else if (sh.type === 'wire') {
      const [[x1, y1], [x2, y2]] = sh.pts
      out.push(
        <g key={i}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth="3" strokeOpacity="0.95" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth="9" strokeOpacity="0.18" />
          <circle cx={x1} cy={y1} r="6" fill="#0d1117" stroke={col} strokeWidth="3" />
          <circle cx={x2} cy={y2} r="6" fill="#0d1117" stroke={col} strokeWidth="3" />
        </g>
      )
    } else if (sh.type === 'path') {
      const [[x1, y1], [x2, y2]] = sh.pts
      out.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} className="sb-z-path" markerEnd={`url(#${arrow})`} />)
    } else if (sh.solid) {
      // Mur plein, avec un halo de sa couleur
      out.push(<polygon key={i} points={sh.pts.map((p) => p.join(',')).join(' ')} fill={col} fillOpacity="0.92" stroke="#0d1117" strokeOpacity="0.6" strokeWidth="1.5" className="sb-z-wall" style={{ '--glow': col }} />)
    } else if (sh.fade) {
      // Zone orientée : forte au départ, s'estompe vers la fin
      const [[x1, y1], [x2, y2]] = sh.fade
      defs.push(
        <linearGradient key={gid} id={gid} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
          <stop offset="0%" stopColor={col} stopOpacity="0.58" />
          <stop offset="100%" stopColor={col} stopOpacity="0.14" />
        </linearGradient>
      )
      out.push(<polygon key={i} points={sh.pts.map((p) => p.join(',')).join(' ')} fill={`url(#${gid})`} stroke={col} strokeWidth="2" strokeOpacity="0.75" />)
    } else {
      out.push(<polygon key={i} points={sh.pts.map((p) => p.join(',')).join(' ')} fill={col} fillOpacity="0.3" stroke={col} strokeWidth="2" />)
    }
  })
  return (
    <g className={`sb-zone sb-zone--${cat}`} pointerEvents="none">
      {defs.length > 0 && <defs>{defs}</defs>}
      {out}
    </g>
  )
}
