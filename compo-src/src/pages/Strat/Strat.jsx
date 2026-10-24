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
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import Loader from '../../components/Loader/Loader'
import './Strat.css'

const COLORS = ['#ffa043', '#ffffff', '#ff6170', '#4cc9f0', '#4ade80', '#b78cff']
const SLOT_KEY = { Ability1: 'Q', Ability2: 'E', Grenade: 'C', Ultimate: 'X' }
const SLOT_ORDER = ['Grenade', 'Ability1', 'Ability2', 'Ultimate']
const TOOLS = [
  { id: 'select', label: 'Déplacer', key: 'v', icon: 'M5 3l14 8-6 1.5L10 19z' },
  { id: 'arrow', label: 'Flèche', key: 'a', icon: 'M5 19 19 5M19 5h-8M19 5v8' },
  { id: 'line', label: 'Trait', key: 'l', icon: 'M5 19 19 5' },
  { id: 'draw', label: 'Crayon', key: 'd', icon: 'M4 17c3-6 5 2 8-3s4-6 8-4' },
  { id: 'zone', label: 'Zone', key: 'z', icon: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z' },
  { id: 'text', label: 'Texte', key: 't', icon: 'M5 6h14M12 6v13' },
  { id: 'erase', label: 'Gomme', key: 'e', icon: 'M8 19h12M4 15l9-9 5 5-8 8H8z' },
]
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
  const makePng = () => renderStratPng({ map, strat, step, agentByUuid })
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
  const saveLabel = { saved: 'Enregistré', pending: 'Modifications…', saving: 'Enregistrement…', error: 'Échec de l’enregistrement' }[save]

  return (
    <main className="strat container">
      <div className="strat__head">
        <Link to={`/editor/${strat.mapUuid}`} className="strat__back">← {map?.name || 'Map'}</Link>
        <div className="strat__title-row">
          <div className="strat__title">
            <span className="eyebrow">Tableau tactique · {map?.name}</span>
            {editable ? (
              <input
                className="strat__name"
                value={strat.name}
                maxLength={60}
                aria-label="Nom de la strat"
                onChange={(e) => queue({ name: e.target.value || 'Strat' })}
              />
            ) : (
              <h1 className="strat__name strat__name--ro">{strat.name}</h1>
            )}
          </div>
          <div className="strat__meta">
            {editable && <span className={`strat__save strat__save--${save}`} aria-live="polite">{saveLabel}</span>}
            <div className="strat__seg" role="group" aria-label="Côté">
              {[['attaque', 'Attaque'], ['defense', 'Défense']].map(([v, l]) => (
                <button key={v} type="button" className={strat.side === v ? `on ${v}` : ''} disabled={!editable} onClick={() => queue({ side: v })}>
                  {l}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost strat__flip" onClick={() => (editable ? queue({ flipped: !strat.flipped }) : patchLocal(stratId, { flipped: !strat.flipped }))} title="Retourner la carte">
              ↻ Retourner
            </button>
          </div>
        </div>
        <div className="strat__sub">
          <label className="strat__comp">
            <span>Compo liée</span>
            <select value={strat.compositionId || ''} disabled={!editable} onChange={(e) => queue({ compositionId: e.target.value || null })}>
              <option value="">Aucune</option>
              {comps.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <div className="strat__exports">
            <button type="button" className="btn btn-ghost" onClick={download} disabled={busy}>Exporter l’étape</button>
            {canCopy && <button type="button" className="btn btn-ghost" onClick={copy} disabled={busy}>Copier</button>}
            {editable && <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Supprimer</button>}
          </div>
        </div>
      </div>

      <div className="strat__steps" role="tablist" aria-label="Étapes">
        {strat.steps.map((s, i) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === step.id} className={`strat__step${s.id === step.id ? ' on' : ''}`} onClick={() => { setStepId(s.id); setSelectedId(null) }}>
            <i>{i + 1}</i>{s.name}
          </button>
        ))}
        {editable && <button type="button" className="strat__step strat__step--add" onClick={addStep} title="Nouvelle étape (reprend la position actuelle)">+ Étape</button>}
      </div>

      <div className={`strat__body${editable ? '' : ' strat__body--ro'}`}>
        {editable && (
          <div className="strat__tools" role="toolbar" aria-label="Outils">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className={`strat__tool${tool === t.id ? ' on' : ''}`} onClick={() => chooseTool(t.id)} title={`${t.label} (${t.key.toUpperCase()})`} aria-pressed={tool === t.id}>
                <Ico d={t.icon} />
                <span>{t.label}</span>
              </button>
            ))}
            <button type="button" className={`strat__tool${tool === 'place' && place?.t === 'spike' ? ' on' : ''}`} onClick={() => startPlace({ t: 'spike' })} title="Spike">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 18 12 12 21 6 12z" fill="#ff4655" /></svg>
              <span>Spike</span>
            </button>
            <div className="strat__colors" role="group" aria-label="Couleur">
              {COLORS.map((c) => (
                <button key={c} type="button" className={`strat__color${color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Couleur ${c}`} aria-pressed={color === c}
                  onClick={() => { setColor(c); if (selected && 'c' in selected) updateSelected({ c }) }} />
              ))}
            </div>
            <div className="strat__history">
              <button type="button" className="strat__tool" onClick={undo} title="Annuler (Ctrl+Z)"><Ico d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /><span>Annuler</span></button>
              <button type="button" className="strat__tool" onClick={redo} title="Rétablir (Ctrl+Y)"><Ico d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /><span>Rétablir</span></button>
            </div>
          </div>
        )}

        <div className="strat__board">
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
          />
          {editable && (
            <p className="strat__hint">
              {tool === 'place' && place?.t === 'agent' ? 'Clique sur la carte pour poser l’agent.'
                : tool === 'place' && place?.t === 'ability' ? 'Clique pour poser la capacité, autant de fois que tu veux. Échap pour arrêter.'
                : tool === 'place' ? 'Clique pour poser le spike.'
                : tool === 'select' ? 'Clique un élément pour le sélectionner, glisse pour le déplacer. Suppr pour l’effacer.'
                : tool === 'zone' ? 'Clique et tire pour dessiner une zone.'
                : tool === 'text' ? 'Clique sur la carte pour écrire.'
                : tool === 'erase' ? 'Clique un élément pour l’effacer.'
                : 'Clique et tire sur la carte.'}
            </p>
          )}
        </div>

        {editable && (
          <aside className="strat__panel">
            <div className="strat__card">
              <span className="panel-eyebrow">{comp ? `Agents de « ${comp.name} »` : 'Agents'}</span>
              {!comp && <p className="strat__muted">Lie une compo pour avoir ses 5 agents sous la main.</p>}
              <div className="strat__agents">
                {(compAgents.length ? compAgents : agentsInStrat).map((a, i) => (
                  <button key={a.uuid + i} type="button" className={`strat__agent${pickAgent === a.uuid ? ' on' : ''}`} onClick={() => { setPickAgent(a.uuid); startPlace({ t: 'agent', a: a.uuid }) }} title={`Poser ${a.name}`}>
                    <img src={a.icon} alt="" />
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="strat__more" onClick={() => setAllOpen((v) => !v)} aria-expanded={allOpen}>
                {allOpen ? 'Masquer les autres agents' : 'Tous les agents'}
              </button>
              {allOpen && (
                <>
                  <input className="strat__search" placeholder="Chercher un agent" value={agentQuery} onChange={(e) => setAgentQuery(e.target.value)} />
                  <div className="strat__agents strat__agents--all">
                    {filteredAgents.map((a) => (
                      <button key={a.uuid} type="button" className={`strat__agent strat__agent--sm${pickAgent === a.uuid ? ' on' : ''}`} onClick={() => { setPickAgent(a.uuid); startPlace({ t: 'agent', a: a.uuid }) }} title={a.name}>
                        <img src={a.icon} alt="" />
                        <span>{a.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {picked && (
              <div className="strat__card">
                <span className="panel-eyebrow">Capacités · {picked.name}</span>
                <div className="strat__abilities">
                  {SLOT_ORDER.map((slot) => picked.abilities?.find((x) => x.slot === slot)).filter(Boolean).map((ab) => (
                    <button key={ab.slot} type="button" className={`strat__ability${tool === 'place' && place?.t === 'ability' && place.a === picked.uuid && place.s === ab.slot ? ' on' : ''}`}
                      onClick={() => startPlace({ t: 'ability', a: picked.uuid, s: ab.slot })} title={ab.name}>
                      <img src={ab.icon} alt="" />
                      <kbd>{SLOT_KEY[ab.slot]}</kbd>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="strat__card">
              <span className="panel-eyebrow">Étape</span>
              <input className="strat__text-input" value={step.name} maxLength={30} aria-label="Nom de l'étape" onChange={(e) => renameStep(e.target.value)} />
              <div className="strat__step-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setItems([])} disabled={!step.items.length}>Vider</button>
                <button type="button" className="btn btn-ghost" onClick={deleteStep} disabled={strat.steps.length <= 1}>Supprimer l’étape</button>
              </div>
            </div>
            {selected && (
              <div className="strat__card">
                <span className="panel-eyebrow">Élément sélectionné</span>
                {selected.t === 'text' && (
                  <input ref={textRef} className="strat__text-input" value={selected.v} maxLength={40} aria-label="Texte"
                    onChange={(e) => setSteps(strat.steps.map((s) => (s.id === step.id ? { ...s, items: s.items.map((i) => (i.id === selectedId ? { ...i, v: e.target.value } : i)) } : s)), { record: false })} />
                )}
                <button type="button" className="btn btn-danger" onClick={deleteSelected}>Effacer</button>
              </div>
            )}
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
