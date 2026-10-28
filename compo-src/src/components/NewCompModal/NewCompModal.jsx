import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import AgentSelectionModal from '../AgentSelectionModal/AgentSelectionModal'
import CompMosaic from '../CompMosaic/CompMosaic'
import { FREE_MAP } from '../../context/DataContext'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import '../ConfirmDialog/ConfirmDialog.css'
import './NewCompModal.css'

const EMPTY = () => ({ name: '', map: FREE_MAP.uuid, agents: [null, null, null, null, null] })

/**
 * Créer une compo de A à Z : nom, map (ou aucune) et agents.
 * Rien n'est créé avant « Créer la compo » ; fermer avec des changements demande confirmation.
 */
export default function NewCompModal({ open, onClose, maps, agents, createComposition }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [picking, setPicking] = useState(null) // index du slot en cours de choix
  const [busy, setBusy] = useState(false)
  const agentByUuid = useMemo(() => new Map(agents.map((a) => [a.uuid, a])), [agents])
  const realMaps = useMemo(() => maps.filter((m) => !m.free).sort((a, b) => a.name.localeCompare(b.name)), [maps])
  const dirty = open && (form.name.trim() !== '' || form.map !== FREE_MAP.uuid || form.agents.some(Boolean))
  const map = maps.find((m) => m.uuid === form.map)

  const reset = () => { setForm(EMPTY()); setPicking(null) }
  const close = () => { reset(); onClose() }

  const create = async () => {
    if (busy) return false
    setBusy(true)
    const id = await createComposition(form.map, form.name.trim() || 'Nouvelle compo', {
      slots: form.agents.map((agentUuid) => ({ agentUuid, playerId: null })),
    })
    setBusy(false)
    if (!id) return false
    allow()
    const target = `/editor/${form.map}?comp=${id}`
    reset()
    onClose()
    navigate(target)
    return true
  }

  const { guard, allow, dialog } = useUnsavedGuard({
    when: dirty,
    label: 'la nouvelle compo',
    onSave: create,
    onDiscard: reset,
  })

  const setAgent = (i, uuid) => setForm((f) => ({ ...f, agents: f.agents.map((a, j) => (j === i ? uuid : a)) }))
  const slots = form.agents.map((agentUuid) => ({ agentUuid }))

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div className="confirm-scrim ncm-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) guard(close) }}>
            <motion.form
              className="ncm glass-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ncm-title"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              onSubmit={(e) => { e.preventDefault(); create() }}
              onKeyDown={(e) => { if (e.key === 'Escape' && picking == null) { e.stopPropagation(); guard(close) } }}
            >
              <div className="ncm__preview">
                {map && !map.free && map.image ? (
                  <img className="ncm__mapimg" src={map.image} alt="" />
                ) : (
                  <CompMosaic slots={slots} agentByUuid={agentByUuid} />
                )}
                <div className="ncm__preview-txt">
                  <small>{map && !map.free ? map.name : 'Sans map'}</small>
                  <b>{form.name.trim() || 'Nouvelle compo'}</b>
                </div>
              </div>

              <div className="ncm__body">
                <h2 id="ncm-title">Ajouter une compo</h2>

                <label className="ncm__field">
                  <span>Nom</span>
                  <input autoFocus maxLength={40} placeholder="ex : Anti-rush, Compo fun, Eco…" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>

                <label className="ncm__field">
                  <span>Map</span>
                  <select value={form.map} onChange={(e) => setForm((f) => ({ ...f, map: e.target.value }))}>
                    <option value={FREE_MAP.uuid}>Aucune map</option>
                    {realMaps.map((m) => <option key={m.uuid} value={m.uuid}>{m.name}</option>)}
                  </select>
                </label>

                <div className="ncm__field">
                  <span>Agents <em>(facultatif, modifiable ensuite)</em></span>
                  <div className="ncm__slots">
                    {form.agents.map((uuid, i) => {
                      const a = uuid ? agentByUuid.get(uuid) : null
                      return (
                        <button key={i} type="button" className={`ncm__slot${a ? ' on' : ''}`} onClick={() => setPicking(i)}
                          aria-label={a ? `Agent ${i + 1} : ${a.name}, changer` : `Choisir l'agent ${i + 1}`}>
                          {a ? <img src={a.icon} alt="" /> : <span aria-hidden="true">+</span>}
                          <small>{a ? a.name : `Agent ${i + 1}`}</small>
                          {a && (
                            <i role="button" tabIndex={0} aria-label={`Retirer ${a.name}`} className="ncm__x"
                              onClick={(e) => { e.stopPropagation(); setAgent(i, null) }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); setAgent(i, null) } }}>×</i>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="ncm__actions">
                  <button type="button" className="btn btn-ghost" onClick={() => guard(close)}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer la compo'}</button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AgentSelectionModal
        open={picking != null}
        agents={agents}
        usedAgentUuids={new Set(form.agents.filter((a, j) => a && j !== picking))}
        currentAgentUuid={picking != null ? form.agents[picking] : null}
        onSelect={(uuid) => { setAgent(picking, uuid); setPicking(null) }}
        onClose={() => setPicking(null)}
      />
      {dialog}
    </>
  )
}
