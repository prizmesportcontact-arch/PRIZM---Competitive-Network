// ============================================================
// Zones réelles des capacités, en mètres, pour le tableau tactique.
//
// Source : wiki Valorant (valorant.fandom.com), tableaux de stats de chaque
// capacité (la plupart relevés dans les fichiers du jeu), octobre 2026.
// Les capacités sans zone (flashs, buffs, caméras, téléportations…) n'ont
// pas d'entrée : elles restent une simple icône.
// approx: true = taille non publiée, valeur indicative (affichée avec « ≈ »).
//
// Formes :
//   circle  { r }                         zone pleine (smoke, molly, slow…)
//   ring    { r }                         rayon de détection / révélation (contour)
//   wall    { l, w, from, min, max }      mur ou barre ; from 'origin' = part du point posé
//                                         dans la direction choisie, 'center' = centré
//   rect    { l, w, off }                 zone rectangulaire devant le point posé (off = décalage)
//   cone    { l, a }                      cône (portée, angle en degrés)
//   lane    { l, back, gap }              deux murs parallèles (Fast Lane)
//   cross   { arm }                       quatre barres en croix (Barrier Mesh)
//   path    { l }                         trajet (dash, vague) — longueur réelle
// min/max : longueur réglable en tirant (murs de Viper, Harbor, Phoenix…)
// ============================================================

export const CAT_COLOR = {
  smoke: '#c3cee0',
  fire: '#ff7a45',
  slow: '#4cc9f0',
  heal: '#4ade80',
  reveal: '#f2d45c',
  stun: '#ff9ecf',
  wall: '#e7ecf3',
  damage: '#ff6170',
  move: '#ffa043',
  trap: '#b78cff',
}

const S = {
  // ---------- Contrôleurs ----------
  'Omen:Ability2': { k: 'circle', r: 4.1, cat: 'smoke' }, // Dark Cover
  'Brimstone:Ability2': { k: 'circle', r: 4.15, cat: 'smoke' }, // Sky Smoke
  'Brimstone:Ability1': { k: 'circle', r: 4.5, cat: 'fire' }, // Incendiary
  'Brimstone:Grenade': { k: 'circle', r: 6, cat: 'heal' }, // Stim Beacon
  'Brimstone:Ultimate': { k: 'circle', r: 9, cat: 'fire' }, // Orbital Strike
  'Viper:Ability1': { k: 'circle', r: 4.5, cat: 'smoke' }, // Poison Cloud
  'Viper:Ability2': { k: 'wall', from: 'origin', l: 30, min: 4, max: 60, w: 1, cat: 'smoke' }, // Toxic Screen
  'Viper:Grenade': { k: 'circle', r: 4.5, cat: 'fire' }, // Snake Bite
  'Viper:Ultimate': { k: 'circle', r: 9, cat: 'smoke' }, // Viper's Pit
  'Astra:Ability1': { k: 'circle', r: 4.75, cat: 'stun' }, // Nova Pulse
  'Astra:Ability2': { k: 'circle', r: 4.75, cat: 'smoke' }, // Nebula
  'Astra:Grenade': { k: 'circle', r: 4.75, cat: 'trap' }, // Gravity Well
  'Astra:Ultimate': { k: 'wall', from: 'center', l: 120, min: 20, max: 300, w: 1.2, cat: 'smoke' }, // Cosmic Divide
  'Harbor:Ability1': { k: 'wall', from: 'origin', l: 30, min: 4, max: 60, w: 1.2, cat: 'smoke' }, // High Tide
  'Harbor:Grenade': { k: 'circle', r: 6, cat: 'slow' }, // Storm Surge
  'Harbor:Ability2': { k: 'circle', r: 4.6, cat: 'smoke' }, // Cove
  'Harbor:Ultimate': { k: 'path', l: 34, cat: 'stun' }, // Reckoning
  'Clove:Ability2': { k: 'circle', r: 4, cat: 'smoke' }, // Ruse
  'Clove:Ability1': { k: 'circle', r: 4, cat: 'trap' }, // Meddle
  'Miks:Grenade': { k: 'circle', r: 5.5, cat: 'stun' }, // M-pulse
  'Miks:Ability2': { k: 'circle', r: 4.72, cat: 'smoke' }, // Waveform
  'Miks:Ultimate': { k: 'cone', l: 40, a: 60, cat: 'stun' }, // Bassquake

  // ---------- Initiateurs ----------
  'Sova:Ability1': { k: 'circle', r: 4, cat: 'damage' }, // Shock Bolt
  'Sova:Ability2': { k: 'ring', r: 30, cat: 'reveal' }, // Recon Bolt
  'Sova:Ultimate': { k: 'rect', l: 66, w: 3.52, off: 0, cat: 'damage' }, // Hunter's Fury
  'Breach:Ability2': { k: 'rect', l: 32, min: 8, max: 56, w: 8, off: 8, cat: 'stun' }, // Fault Line
  'Breach:Grenade': { k: 'circle', r: 3, cat: 'damage' }, // Aftershock
  'Breach:Ultimate': { k: 'rect', l: 32, w: 18, off: 8, cat: 'stun' }, // Rolling Thunder
  'Skye:Grenade': { k: 'ring', r: 18, cat: 'heal' }, // Regrowth
  'KAY/O:Grenade': { k: 'circle', r: 4, cat: 'damage' }, // FRAG/ment
  'KAY/O:Ability2': { k: 'ring', r: 15, cat: 'trap' }, // ZERO/point
  'KAY/O:Ultimate': { k: 'ring', r: 42.5, cat: 'trap' }, // NULL/cmd
  'Fade:Ability1': { k: 'circle', r: 6.58, cat: 'trap' }, // Seize
  'Fade:Ability2': { k: 'ring', r: 30, cat: 'reveal' }, // Haunt
  'Fade:Ultimate': { k: 'rect', l: 40, w: 20, off: 0, cat: 'trap' }, // Nightfall
  'Gekko:Grenade': { k: 'circle', r: 6.2, cat: 'fire' }, // Mosh Pit
  'Gekko:Ultimate': { k: 'circle', r: 5, cat: 'stun' }, // Thrash (zone de lunge)
  'Tejo:Ability2': { k: 'circle', r: 4.5, cat: 'damage' }, // Guided Salvo
  'Tejo:Ability1': { k: 'circle', r: 5.25, cat: 'stun' }, // Special Delivery
  'Tejo:Ultimate': { k: 'rect', l: 32, w: 12, off: 0, cat: 'damage' }, // Armageddon
  'Tejo:Grenade': { k: 'ring', r: 18, cat: 'reveal' }, // Stealth Drone

  // ---------- Duellistes ----------
  'Phoenix:Grenade': { k: 'wall', from: 'origin', l: 14, min: 1, max: 21, w: 1, cat: 'fire' }, // Blaze
  'Phoenix:Ability1': { k: 'circle', r: 4.5, cat: 'fire' }, // Hot Hands
  'Jett:Grenade': { k: 'circle', r: 3.35, cat: 'smoke' }, // Cloudburst
  'Jett:Ability2': { k: 'path', l: 11, cat: 'move' }, // Tailwind
  'Raze:Ability1': { k: 'circle', r: 5, cat: 'damage' }, // Blast Pack
  'Raze:Ability2': { k: 'circle', r: 5.5, cat: 'damage' }, // Paint Shells
  'Raze:Ultimate': { k: 'circle', r: 7, cat: 'damage' }, // Showstopper
  'Neon:Ability1': { k: 'circle', r: 5, cat: 'stun' }, // Relay Bolt
  'Neon:Grenade': { k: 'lane', l: 45, back: 1.5, gap: 3.5, cat: 'wall' }, // Fast Lane
  'Iso:Ability1': { k: 'rect', l: 34.9, w: 6, off: 0, cat: 'trap' }, // Undercut
  'Iso:Ultimate': { k: 'rect', l: 36, w: 15, off: 0, cat: 'trap' }, // Kill Contract
  'Iso:Grenade': { k: 'path', l: 27.5, cat: 'wall' }, // Contingency
  'Waylay:Grenade': { k: 'circle', r: 6, cat: 'trap' }, // Saturate
  'Waylay:Ability1': { k: 'path', l: 9, cat: 'move' }, // Lightspeed
  'Waylay:Ultimate': { k: 'rect', l: 36, w: 13.5, off: 3, cat: 'slow' }, // Convergent Paths

  // ---------- Sentinelles ----------
  'Sage:Grenade': { k: 'wall', from: 'center', l: 10.4, w: 1.5, cat: 'wall' }, // Barrier Orb
  'Sage:Ability1': { k: 'circle', r: 6.5, cat: 'slow', approx: true }, // Slow Orb
  'Killjoy:Grenade': { k: 'circle', r: 4.5, cat: 'damage' }, // Nanoswarm
  'Killjoy:Ability2': { k: 'cone', l: 20, a: 100, cat: 'damage', approx: true }, // TURRET
  'Killjoy:Ultimate': { k: 'ring', r: 32.5, cat: 'trap' }, // Lockdown
  'Cypher:Ability1': { k: 'circle', r: 3.72, cat: 'smoke' }, // Cyber Cage
  'Cypher:Grenade': { k: 'wall', from: 'center', l: 8, min: 1, max: 15, w: 0.4, cat: 'trap' }, // Trapwire
  'Chamber:Ability2': { k: 'ring', r: 18, cat: 'move' }, // Rendezvous
  'Chamber:Grenade': { k: 'circle', r: 6, cat: 'slow' }, // Trademark (zone de slow)
  'Chamber:Ultimate': { k: 'circle', r: 6, cat: 'slow' }, // Tour De Force (slow au kill)
  'Deadlock:Ability1': { k: 'rect', l: 9, w: 8, off: -4.5, cat: 'stun' }, // Sonic Sensor
  'Deadlock:Grenade': { k: 'cross', arm: 10, cat: 'wall' }, // Barrier Mesh
  'Deadlock:Ability2': { k: 'circle', r: 6.5, cat: 'trap' }, // GravNet
  'Deadlock:Ultimate': { k: 'rect', l: 40, w: 6, off: 0, cat: 'trap' }, // Annihilation
  'Vyse:Ability2': { k: 'ring', r: 10, cat: 'stun' }, // Arc Rose
  'Vyse:Grenade': { k: 'circle', r: 6.25, cat: 'damage' }, // Razorvine
  'Vyse:Ultimate': { k: 'ring', r: 28, cat: 'trap' }, // Steel Garden
  'Veto:Ability2': { k: 'ring', r: 18, cat: 'trap' }, // Interceptor
  'Veto:Grenade': { k: 'ring', r: 30, cat: 'move' }, // Crosscut
  'Veto:Ability1': { k: 'circle', r: 6.58, cat: 'trap' }, // Chokehold
}

// Couleur des smokes et murs, comme en jeu
const AGENT_SMOKE = {
  Omen: '#9b8cff', Brimstone: '#d4dbe6', Viper: '#62d98a', Astra: '#c792ff', Harbor: '#38d0d6',
  Clove: '#ff9ecf', Miks: '#7fa8ff', Jett: '#e6eef8', Cypher: '#e6eef8', Phoenix: '#ff7a45',
}
export function colorFor(agentName, spec) {
  if (!spec) return '#ffffff'
  if ((spec.cat === 'smoke' || spec.k === 'wall') && AGENT_SMOKE[agentName]) return AGENT_SMOKE[agentName]
  return CAT_COLOR[spec.cat] || '#ffffff'
}

export function shapeFor(agentName, slot) {
  return S[`${agentName}:${slot}`] || null
}

export const isDirectional = (spec) =>
  Boolean(spec && (spec.k === 'rect' || spec.k === 'cone' || spec.k === 'lane' || spec.k === 'path' || (spec.k === 'wall' && spec.from === 'origin')))
export const isRotatable = (spec) => Boolean(spec && (isDirectional(spec) || spec.k === 'wall' || spec.k === 'cross'))
export const hasLength = (spec) => Boolean(spec && spec.max)

/** Échelle de la minimap : unités du tableau (0–1000) par mètre. */
export function mapScale(map) {
  const m = Math.abs(map?.mult || 0)
  return m > 0 ? m * 100000 : 7
}

const rot = (x, y, cx, cy, deg) => {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [cx + x * c - y * s, cy + x * s + y * c]
}
const box = (x0, x1, hw, cx, cy, d) =>
  [[x0, -hw], [x1, -hw], [x1, hw], [x0, hw]].map(([x, y]) => rot(x, y, cx, cy, d))

/**
 * Géométrie d'une capacité posée, dans le repère 0–1000 du tableau.
 * item : { x, y, d (angle en degrés, 0 = vers la droite), l (longueur choisie, m) }
 * Renvoie { shapes: [{ type: 'circle'|'poly'|'path', … }], tip: [x, y] | null }
 */
export function abilityGeometry(spec, item, scale) {
  if (!spec) return { shapes: [], tip: null }
  const { x, y } = item
  const d = item.d ?? -90
  const L = (hasLength(spec) ? Math.min(spec.max, Math.max(spec.min || 0, item.l ?? spec.l)) : spec.l) * scale
  const out = []
  let tip = null
  switch (spec.k) {
    case 'circle':
      out.push({ type: 'circle', cx: x, cy: y, r: spec.r * scale, fill: true })
      break
    case 'ring':
      out.push({ type: 'circle', cx: x, cy: y, r: spec.r * scale, fill: false })
      break
    case 'wall': {
      const hw = Math.max(spec.w * scale, 3) / 2
      if (spec.from === 'center') {
        out.push({ type: 'poly', pts: box(-L / 2, L / 2, hw, x, y, d), fill: true, solid: true })
        tip = rot(L / 2, 0, x, y, d)
      } else {
        out.push({ type: 'poly', pts: box(0, L, hw, x, y, d), fill: true, solid: true })
        tip = rot(L, 0, x, y, d)
      }
      break
    }
    case 'rect': {
      const off = (spec.off || 0) * scale
      out.push({ type: 'poly', pts: box(off, off + L, (spec.w * scale) / 2, x, y, d), fill: true })
      tip = rot(off + L, 0, x, y, d)
      break
    }
    case 'cone': {
      const half = spec.a / 2
      const pts = [[x, y]]
      for (let i = 0; i <= 16; i++) pts.push(rot(L, 0, x, y, d - half + (spec.a * i) / 16))
      out.push({ type: 'poly', pts, fill: true })
      tip = rot(L, 0, x, y, d)
      break
    }
    case 'lane': {
      const g = (spec.gap * scale) / 2
      const back = (spec.back || 0) * scale
      const t = 1.5
      out.push({ type: 'poly', pts: [[-back, -g - t], [L, -g - t], [L, -g + t], [-back, -g + t]].map(([a, b]) => rot(a, b, x, y, d)), fill: true, solid: true })
      out.push({ type: 'poly', pts: [[-back, g - t], [L, g - t], [L, g + t], [-back, g + t]].map(([a, b]) => rot(a, b, x, y, d)), fill: true, solid: true })
      tip = rot(L, 0, x, y, d)
      break
    }
    case 'cross': {
      const arm = spec.arm * scale
      const hw = 2.5
      out.push({ type: 'poly', pts: box(-arm, arm, hw, x, y, d + 45), fill: true, solid: true })
      out.push({ type: 'poly', pts: box(-arm, arm, hw, x, y, d - 45), fill: true, solid: true })
      tip = rot(arm, 0, x, y, d + 45)
      break
    }
    case 'path':
      tip = rot(L, 0, x, y, d)
      out.push({ type: 'path', pts: [[x, y], tip] })
      break
    default:
      break
  }
  return { shapes: out, tip }
}

/** Libellé court des dimensions, pour le panneau. */
export function shapeLabel(spec, item) {
  if (!spec) return null
  const n = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} m`
  const a = spec.approx ? '≈ ' : ''
  const len = hasLength(spec) ? Math.min(spec.max, Math.max(spec.min || 0, item?.l ?? spec.l)) : spec.l
  switch (spec.k) {
    case 'circle': return `${a}Rayon ${n(spec.r)}`
    case 'ring': return `${a}Rayon d’effet ${n(spec.r)}`
    case 'wall': return `${a}Longueur ${n(len)}${spec.max ? ` (max ${n(spec.max)})` : ''}`
    case 'rect': return `${a}${n(len)} × ${n(spec.w)}`
    case 'cone': return `${a}Cône ${n(spec.l)} à ${spec.a}°`
    case 'lane': return `${a}${n(spec.l)}, murs à ${n(spec.gap)}`
    case 'cross': return `${a}Barres de ${n(spec.arm)}`
    case 'path': return `${a}Distance ${n(spec.l)}`
    default: return null
  }
}
