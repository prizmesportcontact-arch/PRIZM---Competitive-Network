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
import { mapScale, shapeFor, shapeLabel } from '../../data/abilityShapes'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import Loader from '../../components/Loader/Loader'
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
  { id: 'erase', label: 'Gomme', key: 'e', icon: 'M8 19h12M4 15l9-9 5 5-8 8H8z', group: 'main' },
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
  const { strats, status, patchLocal, saveStrat, removeStrat, setEditing } = useStrats()
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
  const [tool, setTool] = useState('select')
  const [place, setPlace] = useState(null)
  const [color, setColor] = useState(COLORS[0])
  const [selectedId, setSelectedId] = useState(null)
  const [pickAgent, setPickAgent] = useState(null)
  const [allOpen, setAllOpen] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const [save, setSave] = useState('saved') // saved | pending | saving | error
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showNames, setShowNames] = useState(() => readPref('prizm_strat_names', true))
  const toggleNames = () => setShowNames((v) => { writePref('prizm_strat_names', !v); return !v })
  const history = useRef({ past: [], future: [] })
  const pending = useRef({})
  const timer = useRef(null)
  const textRef = useRef(null)
  const editable = isAdmin

  useEffect(() => {
    setEditing(stratId)
    return () => setEditing(null)
  }, [stratId, setEditing])

  const step = strat ? strat.steps.find((s) => s.id === stepId) || strat.steps[0] : null
  const agentsInStrat = useMemo(() => {
    if (!step) return []
    const ids = [...new Set(step.items.filter((i) => i.t === 'agent').map((i) => i.a))]
    return ids.map((id) => agentByUuid.get(id)).filter(Boolean)
  }, [step, agentByUuid])

  // ---------- Sauvegarde différée ----------
  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const patch = pending.current
    if (!Object.keys(patch).length) return
    pending.current = {}
    setSave('saving')
    const ok = await saveStrat(stratId, patch)
    if (!ok) {
      pending.current = { ...patch, ...pending.current }
      setSave('error')
      return
    }
    setSave(Object.keys(pending.current).length ? 'pending' : 'saved')
  }, [saveStrat, stratId])

  const queue = useCallback(
    (patch) => {
      patchLocal(stratId, patch)
      pending.current = { ...pending.current, ...patch }
      setSave('pending')
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 900)
    },
    [patchLocal, stratId, flush]
  )

  useEffect(() => {
    const beforeUnload = (e) => {
      if (Object.keys(pending.current).length) {
        flush()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      flush()
    }
  }, [flush])

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
    setPlace(p)
    setSelectedId(null)
  }

  const onBoardChange = (items, { selectId, editText } = {}) => {
    setItems(items)
    if (selectId) setSelectedId(selectId)
    if (editText) setTimeout(() => textRef.current?.select(), 30)
  }
  // Un agent se pose une fois : on repasse en déplacement ; les capacités, elles, se posent à la chaîne
  const onPlaced = (p) => {
    if (p.t === 'agent') {
      setPickAgent(p.a)
      setTool('select')
      setPlace(null)
    }
  }

  // ---------- Clavier ----------
  useEffect(() => {
    if (!editable) return undefined
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
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
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t) chooseTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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

  const doDelete = async () => {
    setConfirmDelete(false)
    pending.current = {}
    const mapId = strat.mapUuid
    if (await removeStrat(stratId)) {
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
  const saveLabel = { saved: 'Enregistré', pending: 'Modifié', saving: 'Enregistrement…', error: 'Non enregistré' }[save]
  const stepIndex = strat.steps.findIndex((s) => s.id === step.id)
  const legend = agentsInStrat
  const selAgent = selected && (selected.t === 'agent' || selected.t === 'ability') ? agentByUuid.get(selected.a) : null
  const selAbility = selected?.t === 'ability' ? selAgent?.abilities?.find((x) => x.slot === selected.s) : null

  // Ce que fait l'outil choisi, en une phrase
  const hint = placingAgent ? { img: placingAgent.icon, text: `Clique sur la carte pour placer ${placingAgent.name}.` }
    : placingAbility ? { img: placingAbility.icon, text: placingSpec && placingSpec.k !== 'circle' && placingSpec.k !== 'ring'
        ? `${placingAbility.name} : clique où elle part, puis tire dans la direction voulue${placingSpec.max ? ' (la distance règle la longueur)' : ''}.`
        : `${placingAbility.name} : clique pour la poser, à sa vraie taille. Échap pour arrêter.` }
    : tool === 'place' ? { text: 'Clique sur la carte pour poser le spike.' }
    : tool === 'select' ? { text: 'Clique un élément pour le choisir, fais-le glisser pour le déplacer.' }
    : tool === 'arrow' ? { text: 'Clique et tire : la flèche part de là où tu cliques.' }
    : tool === 'line' ? { text: 'Clique et tire pour tracer un trait droit.' }
    : tool === 'draw' ? { text: 'Dessine à main levée.' }
    : tool === 'zone' ? { text: 'Clique au centre puis tire pour régler la taille.' }
    : tool === 'text' ? { text: 'Clique sur la carte, puis écris dans le panneau à droite.' }
    : { text: 'Clique un élément pour l’effacer.' }

  const agentTile = (a, small = false) => (
    <button
      key={a.uuid}
      type="button"
      className={`sx-agent${small ? ' sx-agent--sm' : ''}${pickAgent === a.uuid ? ' on' : ''}${placingAgent?.uuid === a.uuid ? ' placing' : ''}`}
      style={{ '--role': ROLE_COLOR[a.role?.name] || '#9aa3af' }}
      onClick={() => { setPickAgent(a.uuid); startPlace({ t: 'agent', a: a.uuid }) }}
      title={`Placer ${a.name}`}
    >
      <img src={a.icon} alt="" />
      <span>{a.name}</span>
    </button>
  )

  return (
    <main className={`sx container${editable ? '' : ' sx--ro'}`}>
      <header className="sx-head">
        <Link to={`/editor/${strat.mapUuid}`} className="sx-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {map?.name || 'Map'}
        </Link>
        <div className="sx-head__row">
          <div className="sx-title">
            {editable ? (
              <input className="sx-name" value={strat.name} maxLength={60} aria-label="Nom de la strat" onChange={(e) => queue({ name: e.target.value || 'Strat' })} />
            ) : (
              <h1 className="sx-name">{strat.name}</h1>
            )}
            <p className="sx-sub">
              <span className={`sx-side sx-side--${strat.side}`}>{strat.side === 'defense' ? 'Défense' : 'Attaque'}</span>
              <span>{map?.name}</span>
              <span>{strat.steps.length} étape{strat.steps.length > 1 ? 's' : ''}</span>
              {comp && <span>avec {comp.name}</span>}
            </p>
          </div>
          <div className="sx-head__actions">
            {editable && <span className={`sx-save sx-save--${save}`} aria-live="polite"><i aria-hidden="true" />{saveLabel}</span>}
            {canCopy && <button type="button" className="btn btn-ghost" onClick={copy} disabled={busy}>Copier l’image</button>}
            <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>{busy ? 'Image en cours…' : 'Exporter l’étape'}</button>
          </div>
        </div>
      </header>

      <div className="sx-work">
        {editable && (
          <nav className="sx-tools" aria-label="Outils">
            <div className="sx-group">
              <span className="sx-group__title">Choisir</span>
              {TOOLS.filter((t) => t.id === 'select').map((t) => (
                <ToolBtn key={t.id} t={t} on={tool === t.id} onClick={() => chooseTool(t.id)} />
              ))}
            </div>
            <div className="sx-group">
              <span className="sx-group__title">Dessiner</span>
              {TOOLS.filter((t) => t.group === 'draw').map((t) => (
                <ToolBtn key={t.id} t={t} on={tool === t.id} onClick={() => chooseTool(t.id)} />
              ))}
            </div>
            <div className="sx-group">
              <span className="sx-group__title">Placer</span>
              <button type="button" className={`sx-tool${tool === 'place' && place?.t === 'spike' ? ' on' : ''}`} onClick={() => startPlace({ t: 'spike' })} title="Spike">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 18 12 12 21 6 12z" fill="#ff4655" stroke="#fff" strokeWidth="1.5" /></svg>
                <span>Spike</span>
              </button>
              {TOOLS.filter((t) => t.id === 'erase').map((t) => (
                <ToolBtn key={t.id} t={t} on={tool === t.id} onClick={() => chooseTool(t.id)} />
              ))}
            </div>
            <div className="sx-group">
              <span className="sx-group__title">Couleur</span>
              <div className="sx-colors" role="radiogroup" aria-label="Couleur des traits">
                {COLORS.map(([c, n]) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} className={`sx-color${color === c ? ' on' : ''}`} style={{ '--c': c }} title={n}
                    onClick={() => { setColor(c); if (selected && 'c' in selected) updateSelected({ c }) }} />
                ))}
              </div>
            </div>
            <div className="sx-group sx-group--row">
              <button type="button" className="sx-tool sx-tool--icon" onClick={undo} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Ico d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></button>
              <button type="button" className="sx-tool sx-tool--icon" onClick={redo} title="Rétablir (Ctrl+Y)" aria-label="Rétablir"><Ico d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></button>
            </div>
          </nav>
        )}

        <section className="sx-stage" aria-label="Carte">
          <div className="sx-steps" role="tablist" aria-label="Étapes de la strat">
            {strat.steps.map((s, i) => (
              <button key={s.id} type="button" role="tab" aria-selected={s.id === step.id} className={`sx-step${s.id === step.id ? ' on' : ''}${i < stepIndex ? ' done' : ''}`}
                onClick={() => { setStepId(s.id); setSelectedId(null) }}>
                <i>{i + 1}</i><span>{s.name}</span>
              </button>
            ))}
            {editable && (
              <button type="button" className="sx-step sx-step--add" onClick={addStep} title="Ajoute une étape qui reprend la position actuelle">
                <i>+</i><span>Étape suivante</span>
              </button>
            )}
          </div>

          <div className={`sx-board sx-board--${strat.side}`}>
            <StratBoard
              minimap={map?.minimap}
              flipped={strat.flipped}
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
              <div className="sx-empty">
                {editable ? (
                  <>
                    <b>Étape vide</b>
                    <p>Commence par placer tes agents : choisis-en un dans le panneau{compAgents.length ? ' de la compo' : ''}, puis clique sur la carte.</p>
                  </>
                ) : (
                  <b>Rien sur cette étape pour l’instant.</b>
                )}
              </div>
            )}
            {editable && (
              <p className="sx-hint" aria-live="polite">
                {hint.img && <img src={hint.img} alt="" />}
                {hint.text}
              </p>
            )}
            <div className="sx-board__corner">
              <button type="button" className="sx-chip" onClick={toggleNames} aria-pressed={showNames}>{showNames ? 'Masquer les noms' : 'Afficher les noms'}</button>
              <button type="button" className="sx-chip" onClick={() => (editable ? queue({ flipped: !strat.flipped }) : patchLocal(stratId, { flipped: !strat.flipped }))} title="Tourner la carte d’un demi-tour">
                Retourner la carte
              </button>
            </div>
          </div>

          {legend.length > 0 && (
            <ul className="sx-legend" aria-label="Agents sur cette étape">
              {legend.map((a) => (
                <li key={a.uuid} style={{ '--role': ROLE_COLOR[a.role?.name] || '#9aa3af' }}><img src={a.icon} alt="" />{a.name}</li>
              ))}
            </ul>
          )}
        </section>

        {editable && (
          <aside className="sx-panel">
            <section className="sx-box">
              <h2 className="sx-box__title">Réglages</h2>
              <div className="sx-field">
                <span>Côté</span>
                <div className="sx-seg" role="radiogroup" aria-label="Côté">
                  {[['attaque', 'Attaque'], ['defense', 'Défense']].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={strat.side === v} className={strat.side === v ? `on ${v}` : ''} onClick={() => queue({ side: v })}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="sx-field">
                <span>Compo liée</span>
                <select value={strat.compositionId || ''} onChange={(e) => queue({ compositionId: e.target.value || null })}>
                  <option value="">Aucune</option>
                  {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="sx-field">
                <span>Nom de l’étape {stepIndex + 1}</span>
                <input value={step.name} maxLength={30} onChange={(e) => renameStep(e.target.value)} />
              </label>
            </section>

            <section className="sx-box">
              <h2 className="sx-box__title">Agents</h2>
              {compAgents.length > 0 ? (
                <div className="sx-agents">{compAgents.map((a) => agentTile(a))}</div>
              ) : (
                <p className="sx-muted">Lie une compo dans les réglages pour avoir ses 5 agents ici.</p>
              )}
              <button type="button" className="sx-link" onClick={() => setAllOpen((v) => !v)} aria-expanded={allOpen}>
                {allOpen ? 'Masquer les autres agents' : 'Voir tous les agents'}
              </button>
              {allOpen && (
                <>
                  <input className="sx-search" placeholder="Chercher un agent" value={agentQuery} onChange={(e) => setAgentQuery(e.target.value)} />
                  <div className="sx-agents sx-agents--all">{filteredAgents.map((a) => agentTile(a, true))}</div>
                </>
              )}

              {picked && (
                <div className="sx-abilities">
                  <span className="sx-abilities__title">Capacités de {picked.name}</span>
                  {SLOT_ORDER.map((slot) => picked.abilities?.find((x) => x.slot === slot)).filter(Boolean).map((ab) => (
                    <button key={ab.slot} type="button"
                      className={`sx-ability${tool === 'place' && place?.t === 'ability' && place.a === picked.uuid && place.s === ab.slot ? ' on' : ''}`}
                      onClick={() => startPlace({ t: 'ability', a: picked.uuid, s: ab.slot })}>
                      <img src={ab.icon} alt="" />
                      <span>{ab.name}<small>{shapeLabel(shapeFor(picked.name, ab.slot)) || 'Icône seule'}</small></span>
                      <kbd>{SLOT_KEY[ab.slot]}</kbd>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={`sx-box sx-box--sel${selected ? ' on' : ''}`}>
              <h2 className="sx-box__title">Sélection</h2>
              {selected ? (
                <>
                  <div className="sx-sel">
                    {selAbility ? <img src={selAbility.icon} alt="" /> : selAgent ? <img src={selAgent.icon} alt="" /> : <i style={{ background: selected.c || '#ff4655' }} />}
                    <span>
                      <b>{selAbility ? selAbility.name : selAgent ? selAgent.name : ITEM_LABEL[selected.t]}</b>
                      <small>{selAbility ? `Capacité de ${selAgent?.name}` : selAgent ? 'Agent' : 'c' in selected ? 'Change la couleur à gauche' : 'Fais-le glisser pour le déplacer'}</small>
                      {selAbility && shapeLabel(shapeFor(selAgent?.name, selected.s), selected) && (
                        <small className="sx-dims">{shapeLabel(shapeFor(selAgent?.name, selected.s), selected)}{shapeFor(selAgent?.name, selected.s)?.k !== 'circle' && shapeFor(selAgent?.name, selected.s)?.k !== 'ring' ? ' · tire la poignée ambre pour l’orienter' : ''}</small>
                      )}
                    </span>
                  </div>
                  {selected.t === 'text' && (
                    <input ref={textRef} className="sx-search" value={selected.v} maxLength={40} aria-label="Texte"
                      onChange={(e) => setSteps(strat.steps.map((s) => (s.id === step.id ? { ...s, items: s.items.map((i) => (i.id === selectedId ? { ...i, v: e.target.value } : i)) } : s)), { record: false })} />
                  )}
                  <button type="button" className="btn btn-danger" onClick={deleteSelected}>Effacer <kbd>Suppr</kbd></button>
                </>
              ) : (
                <p className="sx-muted">Avec l’outil Déplacer, clique un élément de la carte pour le modifier ou l’effacer.</p>
              )}
            </section>

            <section className="sx-box sx-box--quiet">
              <div className="sx-row">
                <button type="button" className="btn btn-ghost" onClick={() => setItems([])} disabled={!step.items.length}>Vider l’étape</button>
                <button type="button" className="btn btn-ghost" onClick={deleteStep} disabled={strat.steps.length <= 1}>Supprimer l’étape</button>
              </div>
              <button type="button" className="sx-delete" onClick={() => setConfirmDelete(true)}>Supprimer la strat</button>
            </section>
          </aside>
        )}
      </div>

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

function ToolBtn({ t, on, onClick }) {
  return (
    <button type="button" className={`sx-tool${on ? ' on' : ''}`} onClick={onClick} title={`${t.label} (${t.key.toUpperCase()})`} aria-pressed={on}>
      <Ico d={t.icon} />
      <span>{t.label}</span>
      <kbd>{t.key.toUpperCase()}</kbd>
    </button>
  )
}
