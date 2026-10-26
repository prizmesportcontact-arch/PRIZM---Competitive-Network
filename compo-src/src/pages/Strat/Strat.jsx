import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useCompositions } from '../../context/CompositionsContext'
import { useStrats } from '../../context/StratsContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { STEP_NAMES, newStep, uid } from '../../services/strats'
import { getCompsForMap } from '../../utils/compositions'
import { renderStratPng } from '../../utils/exportStrat'
import { slugify } from '../../utils/exportComposition'
import StratBoard from '../../components/StratBoard/StratBoard'
import { boardRotation, boardView, useMapCrop } from '../../utils/mapView'
import { mapScale, shapeFor, shapeLabel } from '../../data/abilityShapes'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import Loader from '../../components/Loader/Loader'
import StratPresenter from './StratPresenter'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import './Strat.css'

const COLORS = [
  ['#ffa043', 'Ambre'], ['#ffffff', 'Blanc'], ['#ff6170', 'Rouge'],
  ['#4cc9f0', 'Bleu'], ['#4ade80', 'Vert'], ['#b78cff', 'Violet'],
]
const ROLE_COLOR = { Duelliste: '#ff6170', Contrôleur: '#9b84ff', Initiateur: '#f2d45c', Sentinelle: '#4ade80' }
const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1' } catch { return d } }
const writePref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* navigation privée */ } }
const SLOT_KEY = { Ability1: 'Q', Ability2: 'E', Grenade: 'C', Ultimate: 'X' }
const SLOT_ORDER = ['Grenade', 'Ability1', 'Ability2', 'Ultimate']
const TOOLS = [
  { id: 'select', label: 'Déplacer', key: 'v', icon: 'M5 3l14 8-6 1.5L10 19z', group: 'main' },
  { id: 'arrow', label: 'Flèche', key: 'a', icon: 'M5 19 19 5M19 5h-8M19 5v8', group: 'draw' },
  { id: 'line', label: 'Trait', key: 'l', icon: 'M5 19 19 5', group: 'draw' },
  { id: 'draw', label: 'Crayon', key: 'd', icon: 'M4 17c3-6 5 2 8-3s4-6 8-4', group: 'draw' },
  { id: 'zone', label: 'Zone', key: 'z', icon: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', group: 'draw' },
  { id: 'text', label: 'Texte', key: 't', icon: 'M5 6h14M12 6v13', group: 'draw' },
  { id: 'erase', label: 'Gomme', key: 'g', icon: 'M8 19h12M4 15l9-9 5 5-8 8H8z', group: 'main' },
]
const ITEM_LABEL = { agent: 'Agent', ability: 'Capacité', spike: 'Spike', line: 'Trait', draw: 'Tracé', zone: 'Zone', text: 'Texte' }
const canCopy = typeof window !== 'undefined' && Boolean(window.ClipboardItem) && navigator.clipboard?.write

function Ico({ d }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Strat() {
  const { stratId } = useParams()
  const navigate = useNavigate()
  const { maps, agents, status: dataStatus } = useData()
  const { compositionsByMap } = useCompositions()
  const { strats, status, dirty, createDraft, patchLocal, saveStrat, revertStrat, removeStrat } = useStrats()
  const { isAdmin } = useAuth()
  const { pushToast } = useToast()

  const strat = strats[stratId]
  const mapUuid = strat?.mapUuid
  const map = useMemo(() => maps.find((m) => m.uuid === mapUuid), [maps, mapUuid])
  const agentByUuid = useMemo(() => new Map(agents.map((a) => [a.uuid, a])), [agents])
  const comps = strat ? getCompsForMap(compositionsByMap, strat.mapUuid) : []
  const comp = comps.find((c) => c.id === strat?.compositionId) || null
  const compAgents = comp ? comp.slots.map((s) => agentByUuid.get(s.agentUuid)).filter(Boolean) : []

  const [stepId, setStepId] = useState(null)
  const [presenting, setPresenting] = useState(false)
  const [tool, setTool] = useState('select')
  const [place, setPlace] = useState(null)
  const [color, setColor] = useState(COLORS[0])
  const [selectedId, setSelectedId] = useState(null)
  const [pickAgent, setPickAgent] = useState(null)
  const [allOpen, setAllOpen] = useState(false)
  const [enemy, setEnemy] = useState(false) // pose les agents et capacités dans l'équipe adverse
  const [roleFilter, setRoleFilter] = useState(null)
  const [agentQuery, setAgentQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showNames, setShowNames] = useState(() => readPref('prizm_strat_names', true))
  const toggleNames = () => setShowNames((v) => { writePref('prizm_strat_names', !v); return !v })
  const history = useRef({ past: [], future: [] })
  const textRef = useRef(null)
  const editable = isAdmin


  const step = strat ? strat.steps.find((s) => s.id === stepId) || strat.steps[0] : null
  const agentsInStrat = useMemo(() => {
    if (!step) return []
    const ids = [...new Set(step.items.filter((i) => i.t === 'agent').map((i) => i.a))]
    return ids.map((id) => agentByUuid.get(id)).filter(Boolean)
  }, [step, agentByUuid])

  // ---------- Enregistrement (manuel) ----------
  const isDirty = dirty.has(stratId)
  const crop = useMapCrop(map?.minimap)
  const rotation = boardRotation(map, strat?.side)
  const view = boardView(rotation, crop)

  const queue = useCallback((patch) => patchLocal(stratId, patch), [patchLocal, stratId])

  // Une nouvelle strat n'existe dans la base qu'après son premier enregistrement : elle change alors d'adresse
  const leavingRef = useRef(false)
  const allowRef = useRef(null)
  const doSave = useCallback(async () => {
    if (!strat || saving) return false
    setSaving(true)
    const id = await saveStrat(stratId, strat)
    setSaving(false)
    if (!id) return false
    pushToast(id !== stratId ? 'Strat créée et enregistrée.' : 'Strat enregistrée.', 'success')
    if (id !== stratId && !leavingRef.current) {
      allowRef.current?.()
      navigate(`/strat/${id}`, { replace: true })
    }
    return true
  }, [strat, saving, saveStrat, stratId, pushToast, navigate])

  // Rien ne s'enregistre tout seul : quitter la page sans enregistrer demande confirmation,
  // et les changements abandonnés sont oubliés (la strat revient à sa dernière version enregistrée).
  const { allow, dialog: leaveDialog } = useUnsavedGuard({
    when: isDirty,
    label: strat?.name,
    onSave: async () => {
      leavingRef.current = true
      const ok = await doSave()
      leavingRef.current = false
      return ok
    },
    onDiscard: () => revertStrat(stratId),
  })
  useEffect(() => {
    allowRef.current = allow
  }, [allow])
  const dirtyNow = useRef(false)
  useEffect(() => {
    dirtyNow.current = isDirty
  }, [isDirty])
  useEffect(() => () => {
    if (dirtyNow.current) revertStrat(stratId)
  }, [stratId, revertStrat])

  // ---------- Étapes + historique ----------
  const setSteps = useCallback(
    (steps, { record = true } = {}) => {
      if (record) {
        history.current.past.push(strat.steps)
        if (history.current.past.length > 60) history.current.past.shift()
        history.current.future = []
      }
      queue({ steps })
    },
    [strat, queue]
  )
  const setItems = (items) => setSteps(strat.steps.map((s) => (s.id === step.id ? { ...s, items } : s)))

  const undo = () => {
    const prev = history.current.past.pop()
    if (!prev) return
    history.current.future.push(strat.steps)
    setSelectedId(null)
    queue({ steps: prev })
  }
  const redo = () => {
    const next = history.current.future.pop()
    if (!next) return
    history.current.past.push(strat.steps)
    queue({ steps: next })
  }

  const addStep = () => {
    if (strat.steps.length >= 12) return pushToast('12 étapes maximum.', 'error')
    const name = STEP_NAMES[strat.steps.length] || `Étape ${strat.steps.length + 1}`
    // La nouvelle étape reprend les éléments de l'étape affichée : on part de la position d'avant
    const s = newStep(name, step.items.map((it) => ({ ...it, id: uid() })))
    const i = strat.steps.findIndex((x) => x.id === step.id)
    const steps = [...strat.steps]
    steps.splice(i + 1, 0, s)
    setSteps(steps)
    setStepId(s.id)
  }
  const deleteStep = () => {
    if (strat.steps.length <= 1) return
    const i = strat.steps.findIndex((x) => x.id === step.id)
    const steps = strat.steps.filter((x) => x.id !== step.id)
    setSteps(steps)
    setStepId(steps[Math.max(0, i - 1)].id)
  }
  const renameStep = (name) => setSteps(strat.steps.map((s) => (s.id === step.id ? { ...s, name: name.slice(0, 30) } : s)), { record: false })

  // ---------- Éléments ----------
  const selected = step?.items.find((i) => i.id === selectedId) || null
  const updateSelected = (patch) => setItems(step.items.map((i) => (i.id === selectedId ? { ...i, ...patch } : i)))
  const deleteSelected = () => {
    if (!selected) return
    setItems(step.items.filter((i) => i.id !== selectedId))
    setSelectedId(null)
  }

  const chooseTool = (id) => {
    setTool(id)
    setPlace(null)
    if (id !== 'select') setSelectedId(null)
  }
  const startPlace = (p) => {
    setTool('place')
    setPlace(p.t === 'agent' || p.t === 'ability' ? { ...p, ...(enemy ? { en: true } : {}) } : p)
    setSelectedId(null)
  }
  // Duplique l'élément sélectionné (Ctrl+D), un peu décalé
  const duplicateSelected = () => {
    if (!selected) return
    const nid = uid()
    const copy = selected.p
      ? { ...selected, id: nid, p: selected.p.map((v) => Math.min(1000, v + 18)) }
      : { ...selected, id: nid, x: Math.min(1000, selected.x + 18), y: Math.min(1000, selected.y + 18) }
    setItems([...step.items, copy])
    setSelectedId(nid)
  }

  // Après chaque élément posé ou tracé, on revient sur « Déplacer » et on sélectionne ce qu'on vient d'ajouter
  const onBoardChange = (items, { selectId, editText } = {}) => {
    const before = new Set(step.items.map((i) => i.id))
    const added = items.filter((i) => !before.has(i.id)).pop()
    setItems(items)
    if (tool !== 'select' && tool !== 'erase') {
      setTool('select')
      setPlace(null)
    }
    if (selectId || added) setSelectedId(selectId || added.id)
    if (editText) setTimeout(() => textRef.current?.select(), 30)
  }
  const onPlaced = (p) => {
    if (p.t === 'agent' || p.t === 'ability') setPickAgent(p.a)
  }

  // ---------- Clavier ----------
  useEffect(() => {
    if (!editable) return undefined
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        doSave()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (typing) return
        e.preventDefault()
        duplicateSelected()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (typing) return
        e.preventDefault()
        redo()
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault()
          deleteSelected()
        }
        return
      }
      if (e.key === 'Escape') return chooseTool('select')
      // C, Q, E, X : capacité de l'agent choisi, comme en jeu
      const slot = Object.keys(SLOT_KEY).find((k) => SLOT_KEY[k].toLowerCase() === e.key.toLowerCase())
      const pk = agentByUuid.get(pickAgent)
      if (slot && pk && pk.abilities?.some((x) => x.slot === slot)) {
        e.preventDefault()
        startPlace({ t: 'ability', a: pk.uuid, s: slot })
        return
      }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t) chooseTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const closePresenter = useCallback(() => setPresenting(false), [])

  // ---------- Export ----------
  const makePng = () => renderStratPng({ map, strat, step, agentByUuid, showNames })
  const download = async () => {
    setBusy(true)
    try {
      const blob = await makePng()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `strat-${slugify(map?.name || 'map')}-${slugify(strat.name)}-${slugify(step.name)}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      pushToast("Impossible de générer l'image.", 'error')
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    setBusy(true)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': makePng() })])
      pushToast('Image copiée : colle-la dans Discord.', 'success')
    } catch {
      pushToast("Impossible de copier l'image.", 'error')
    } finally {
      setBusy(false)
    }
  }

  // La copie n'est créée qu'à son premier « Enregistrer »
  const duplicateStrat = () => {
    const id = createDraft({
      mapUuid: strat.mapUuid,
      compositionId: strat.compositionId,
      name: `${strat.name} (copie)`.slice(0, 60),
      side: strat.side,
      steps: strat.steps,
    })
    navigate(`/strat/${id}`)
  }

  const doDelete = async () => {
    setConfirmDelete(false)
    const mapId = strat.mapUuid
    if (await removeStrat(stratId)) {
      allow()
      pushToast('Strat supprimée.', 'success')
      navigate(`/editor/${mapId}`)
    }
  }

  if (status === 'loading' || dataStatus === 'loading') {
    return (
      <main className="container">
        <Loader label="Chargement de la strat…" />
      </main>
    )
  }
  if (!strat) {
    return (
      <main className="container strat-missing">
        <h2>Strat introuvable</h2>
        <p>Elle a peut-être été supprimée.</p>
        <Link to="/strats" className="btn btn-primary">Toutes les strats</Link>
      </main>
    )
  }

  const filteredAgents = agents.filter((a) => a.name.toLowerCase().includes(agentQuery.trim().toLowerCase()))
  const picked = agentByUuid.get(pickAgent)
  const placingAgent = tool === 'place' && place?.t === 'agent' ? agentByUuid.get(place.a) : null
  const placingAbility = tool === 'place' && place?.t === 'ability' ? agentByUuid.get(place.a)?.abilities?.find((x) => x.slot === place.s) : null
  const placingSpec = placingAbility ? shapeFor(agentByUuid.get(place.a)?.name, place.s) : null
  const stepIndex = strat.steps.findIndex((s) => s.id === step.id)
  const legend = agentsInStrat
  const selAgent = selected && (selected.t === 'agent' || selected.t === 'ability') ? agentByUuid.get(selected.a) : null
  const selAbility = selected?.t === 'ability' ? selAgent?.abilities?.find((x) => x.slot === selected.s) : null

  // Ce que fait l'outil choisi, en une phrase
  const hint = placingAgent ? { img: placingAgent.icon, text: `Clique sur la carte pour placer ${placingAgent.name}.` }
    : placingAbility ? { img: placingAbility.icon, text: placingSpec && placingSpec.k !== 'circle' && placingSpec.k !== 'ring'
        ? `${placingAbility.name} : clique où elle part, puis tire dans la direction voulue${placingSpec.max ? ' (la distance règle la longueur)' : ''}.`
        : `${placingAbility.name} : clique pour la poser, à sa vraie taille.` }
    : tool === 'place' ? { text: 'Clique sur la carte pour poser le spike.' }
    : tool === 'select' ? { text: 'Clique un élément pour le choisir, fais-le glisser pour le déplacer.' }
    : tool === 'arrow' ? { text: 'Clique et tire : la flèche part de là où tu cliques.' }
    : tool === 'line' ? { text: 'Clique et tire pour tracer un trait droit.' }
    : tool === 'draw' ? { text: 'Dessine à main levée.' }
    : tool === 'zone' ? { text: 'Clique au centre puis tire pour régler la taille.' }
    : tool === 'text' ? { text: 'Clique sur la carte, puis écris dans l’encart qui s’ouvre.' }
    : { text: 'Clique un élément pour l’effacer.' }

  const roles = [...new Set(agents.map((a) => a.role?.name).filter(Boolean))].sort()
  const stripAgents = allOpen || !compAgents.length ? filteredAgents.filter((a) => !roleFilter || a.role?.name === roleFilter) : compAgents
  const isZoneSpec = (sp) => sp && sp.k !== 'circle' && sp.k !== 'ring'


  return (
    <main className={`sb2${editable ? '' : ' sb2--ro'}`}>
      {/* ---------- Colonne de gauche ---------- */}
      <aside className="sb2-side">
        <div className="sb2-mapcard">
          <Link to={`/editor/${strat.mapUuid}`} className="sb2-map" title="Retour à la map">
            <small>← Retour</small>
            <span>{map?.name || 'Map'}</span>
          </Link>
          <button type="button" className={`sb2-sidebtn ${strat.side}`} disabled={!editable}
            onClick={() => queue({ side: strat.side === 'attaque' ? 'defense' : 'attaque' })} title="Changer de côté">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h13l-3-3M20 15H7l3 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {strat.side === 'defense' ? 'Défense' : 'Attaque'}
          </button>
        </div>

        <section className="sb2-sec">
          <h2>Étapes</h2>
          <div className="sb2-steps" role="tablist" aria-label="Étapes de la strat">
            {strat.steps.map((s, i) => (
              <button key={s.id} type="button" role="tab" aria-selected={s.id === step.id} title={s.name}
                className={`sb2-step${s.id === step.id ? ' on' : ''}${s.items.length ? ' full' : ''}`}
                onClick={() => { setStepId(s.id); setSelectedId(null) }}>{i + 1}</button>
            ))}
            {editable && strat.steps.length < 12 && (
              <button type="button" className="sb2-step sb2-step--add" onClick={addStep} title="Étape suivante (reprend la position actuelle)" aria-label="Ajouter une étape">+</button>
            )}
          </div>
          {editable ? (
            <input className="sb2-input" value={step.name} maxLength={30} aria-label={`Nom de l’étape ${stepIndex + 1}`} onChange={(e) => renameStep(e.target.value)} />
          ) : (
            <p className="sb2-stepname">{stepIndex + 1}. {step.name}</p>
          )}
        </section>

        {editable && (
          <section className="sb2-sec sb2-sec--erase">
            <h2>Effacer</h2>
            <button type="button" className="sb2-del" onClick={() => setItems([])} disabled={!step.items.length}>
              <Ico d="M8 19h12M4 15l9-9 5 5-8 8H8z" />
              <span><b>Tout effacer sur l’étape {stepIndex + 1}</b><small>Enlève les agents et dessins, garde l’étape</small></span>
            </button>
            <button type="button" className="sb2-del" onClick={deleteStep} disabled={strat.steps.length <= 1}>
              <Ico d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              <span><b>Supprimer l’étape {stepIndex + 1}</b><small>{strat.steps.length <= 1 ? 'Il faut au moins une étape' : 'Les autres étapes restent'}</small></span>
            </button>
            <button type="button" className="sb2-del" onClick={duplicateStrat}>
              <Ico d="M9 9h11v11H9zM5 15V4h11" />
              <span><b>Dupliquer la strat</b><small>Crée une copie pour faire une variante</small></span>
            </button>
            <button type="button" className="sb2-del sb2-del--danger" onClick={() => setConfirmDelete(true)}>
              <Ico d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              <span><b>Supprimer toute la strat</b><small>Pour toute l’équipe, demande confirmation</small></span>
            </button>
          </section>
        )}

        {editable && (
          <section className="sb2-sec sb2-sec--tools">
            <h2>Outils</h2>
            <div className="sb2-tools" role="toolbar" aria-label="Outils">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" className={`sb2-tool${tool === t.id ? ' on' : ''}`} onClick={() => chooseTool(t.id)} title={`${t.label} (${t.key.toUpperCase()})`} aria-label={t.label} aria-pressed={tool === t.id}>
                  <Ico d={t.icon} />
                  <kbd>{t.key.toUpperCase()}</kbd>
                </button>
              ))}
              <button type="button" className={`sb2-tool${tool === 'place' && place?.t === 'spike' ? ' on' : ''}`} onClick={() => startPlace({ t: 'spike' })} title="Spike" aria-label="Spike">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 18 12 12 21 6 12z" fill="#ff4655" stroke="#fff" strokeWidth="1.5" /></svg>
              </button>
              <button type="button" className="sb2-tool" onClick={undo} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Ico d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></button>
              <button type="button" className="sb2-tool" onClick={redo} title="Rétablir (Ctrl+Y)" aria-label="Rétablir"><Ico d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></button>
            </div>
            <div className="sb2-colors" role="radiogroup" aria-label="Couleur des traits">
              {COLORS.map(([c, n]) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} className={`sb2-color${color === c ? ' on' : ''}`} style={{ '--c': c }} title={n} aria-label={n}
                  onClick={() => { setColor(c); if (selected && 'c' in selected) updateSelected({ c }) }} />
              ))}
            </div>
          </section>
        )}
      </aside>

      {/* ---------- Carte ---------- */}
      <section className="sb2-stage" aria-label="Carte">
        <div className="sb2-bar">
          <div className="sb2-bar__left">
            {editable ? (
              <input className="sb2-name" value={strat.name} maxLength={60} aria-label="Nom de la strat" onChange={(e) => queue({ name: e.target.value || 'Strat' })} />
            ) : (
              <h1 className="sb2-name">{strat.name}</h1>
            )}
            <label className="sb2-comp" title="Compo liée">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" /><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5M16 5.5a3 3 0 0 1 0 5.6M18.5 14.4c1.4.8 2.2 2.4 2.5 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <select value={strat.compositionId || ''} disabled={!editable} onChange={(e) => queue({ compositionId: e.target.value || null })} aria-label="Compo liée">
                <option value="">Aucune compo</option>
                {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="sb2-bar__right">
            <button type="button" className="sb2-btn sb2-present" onClick={() => setPresenting(true)} title="Plein écran, étape par étape">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
              Présenter
            </button>
            <button type="button" className={`sb2-btn${showNames ? ' on' : ''}`} onClick={toggleNames} aria-pressed={showNames}>
              {showNames ? 'Masquer les noms' : 'Afficher les noms'}
            </button>
            {canCopy && <button type="button" className="sb2-btn" onClick={copy} disabled={busy}>Copier l’image</button>}
            <button type="button" className="sb2-btn" onClick={download} disabled={busy}>Télécharger l’image</button>
            {editable && (
              <button type="button" className={`sb2-save${isDirty ? ' dirty' : ''}`} onClick={doSave} disabled={!isDirty || saving} title="Ctrl+S">
                <i aria-hidden="true" />
                {saving ? 'Enregistrement…' : isDirty ? 'Enregistrer' : 'Enregistré'}
              </button>
            )}
          </div>
        </div>

        <div className="sb2-canvas">
          <div className={`sb2-board sb2-board--${strat.side}`}>
            <StratBoard
              minimap={map?.minimap}
              rotation={rotation}
              view={view}
              side={strat.side}
              items={step.items}
              agentByUuid={agentByUuid}
              editable={editable}
              tool={tool}
              place={place}
              color={color}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={onBoardChange}
              onPlaced={onPlaced}
              showNames={showNames}
              scale={mapScale(map)}
            />
            {step.items.length === 0 && (
              <div className="sb2-empty">
                {editable ? <><b>Étape vide</b><p>Choisis un agent en bas, puis clique sur la carte.</p></> : <b>Rien sur cette étape.</b>}
              </div>
            )}
          </div>

          {editable && (
            <p className="sb2-hint" aria-live="polite">
              {hint.img && <img src={hint.img} alt="" />}
              {hint.text}
            </p>
          )}
          {editable && selected && (
            <div className="sb2-inspect">
              <div className="sb2-sel">
                {selAbility ? <img src={selAbility.icon} alt="" /> : selAgent ? <img src={selAgent.icon} alt="" /> : <i style={{ background: selected.c || '#ff4655' }} />}
                <span>
                  <b>{selAbility ? selAbility.name : selAgent ? selAgent.name : ITEM_LABEL[selected.t]}</b>
                  <small>{selAbility ? (shapeLabel(shapeFor(selAgent?.name, selected.s), selected) || `Capacité de ${selAgent?.name}`) : selAgent ? 'Agent' : ITEM_LABEL[selected.t]}</small>
                </span>
              </div>
              {selected.t === 'text' && (
                <input ref={textRef} className="sb2-input" value={selected.v} maxLength={40} aria-label="Texte"
                  onChange={(e) => setSteps(strat.steps.map((s) => (s.id === step.id ? { ...s, items: s.items.map((i) => (i.id === selectedId ? { ...i, v: e.target.value } : i)) } : s)), { record: false })} />
              )}
              {selAbility && isZoneSpec(shapeFor(selAgent?.name, selected.s)) && <p className="sb2-note">Tire la poignée ambre pour l’orienter.</p>}
              <div className="sb2-row2">
                <button type="button" className="sb2-wide sb2-wide--ghost" onClick={duplicateSelected}>Dupliquer <kbd>Ctrl+D</kbd></button>
                <button type="button" className="sb2-wide sb2-wide--danger" onClick={deleteSelected}>Effacer <kbd>Suppr</kbd></button>
              </div>
            </div>
          )}
        </div>


        {/* ---------- Bandeau des agents ---------- */}
        {editable ? (
          <div className="sb2-dock">
            <div className="sb2-dock__filters">
              {compAgents.length > 0 && (
                <button type="button" className={`sb2-tab${!allOpen ? ' on' : ''}`} onClick={() => setAllOpen(false)}>Compo</button>
              )}
              <button type="button" className={`sb2-tab${allOpen || !compAgents.length ? ' on' : ''}`} onClick={() => setAllOpen(true)}>Tous</button>
              <div className="sb2-team" role="radiogroup" aria-label="Équipe des agents posés">
                <button type="button" role="radio" aria-checked={!enemy} className={!enemy ? `on ${strat.side}` : ''} onClick={() => setEnemy(false)}>Alliés</button>
                <button type="button" role="radio" aria-checked={enemy} className={enemy ? `on ${strat.side === 'attaque' ? 'defense' : 'attaque'}` : ''} onClick={() => setEnemy(true)}>Ennemis</button>
              </div>
            </div>
            {(allOpen || !compAgents.length) && (
              <div className="sb2-roles">
                <input className="sb2-search" placeholder="Chercher" value={agentQuery} onChange={(e) => setAgentQuery(e.target.value)} aria-label="Chercher un agent" />
                <div className="sb2-rolechips" role="group" aria-label="Filtrer par rôle">
                  {roles.map((r) => (
                    <button key={r} type="button" className={roleFilter === r ? 'on' : ''} style={{ '--role': ROLE_COLOR[r] || '#9aa3af' }} onClick={() => setRoleFilter(roleFilter === r ? null : r)}>{r}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="sb2-agents">
              {stripAgents.map((a) => (
                <button key={a.uuid} type="button"
                  className={`sb2-agent${pickAgent === a.uuid ? ' on' : ''}${placingAgent?.uuid === a.uuid ? ' placing' : ''}`}
                  style={{ '--role': ROLE_COLOR[a.role?.name] || '#9aa3af' }}
                  onClick={() => { setPickAgent(a.uuid); startPlace({ t: 'agent', a: a.uuid }) }} title={`Placer ${a.name}`}>
                  <img src={a.icon} alt="" />
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
            {picked && (
              <div className="sb2-abilities" aria-label={`Capacités de ${picked.name}`}>
                {SLOT_ORDER.map((slot) => picked.abilities?.find((x) => x.slot === slot)).filter(Boolean).map((ab) => {
                  const sp = shapeFor(picked.name, ab.slot)
                  const on = tool === 'place' && place?.t === 'ability' && place.a === picked.uuid && place.s === ab.slot
                  return (
                    <button key={ab.slot} type="button" className={`sb2-ability${on ? ' on' : ''}`} onClick={() => startPlace({ t: 'ability', a: picked.uuid, s: ab.slot })}
                      title={`${ab.name}${sp ? ` · ${shapeLabel(sp)}` : ''}`}>
                      <img src={ab.icon} alt="" />
                      <kbd>{SLOT_KEY[ab.slot]}</kbd>
                      <span>{ab.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          legend.length > 0 && (
            <ul className="sb2-legend" aria-label="Agents sur cette étape">
              {legend.map((a) => <li key={a.uuid} style={{ '--role': ROLE_COLOR[a.role?.name] || '#9aa3af' }}><img src={a.icon} alt="" />{a.name}</li>)}
            </ul>
          )
        )}
      </section>

      {leaveDialog}

      {presenting && (
        <StratPresenter
          strat={strat}
          mapName={map?.name}
          minimap={map?.minimap}
          rotation={rotation}
          view={view}
          agentByUuid={agentByUuid}
          scale={mapScale(map)}
          startIndex={Math.max(0, stepIndex)}
          initialNames={showNames}
          onStep={setStepId}
          onClose={closePresenter}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette strat ?"
        description={`« ${strat.name} » et ses ${strat.steps.length} étape(s) seront supprimées pour toute l'équipe.`}
        confirmLabel="Supprimer"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  )
}
