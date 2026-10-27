import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useStrats } from '../../context/StratsContext'
import { useCompositions } from '../../context/CompositionsContext'
import { useAuth } from '../../context/AuthContext'
import StratList from '../../components/StratList/StratList'
import './Strats.css'

/** Toutes les strats de l'équipe, rangées par map */
export default function Strats() {
  const { maps } = useData()
  const { strats, createDraft } = useStrats()
  const { compositionsByMap } = useCompositions()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const realMaps = maps.filter((m) => !m.free && m.minimap)
  const counts = useMemo(() => {
    const c = {}
    Object.values(strats).forEach((s) => { if (!s.draft) c[s.mapUuid] = (c[s.mapUuid] || 0) + 1 })
    return c
  }, [strats])
  const withStrats = realMaps.filter((m) => counts[m.uuid])
  const without = realMaps.filter((m) => !counts[m.uuid])
  const sorted = [...realMaps].sort((a, b) => a.name.localeCompare(b.name))

  // Nouvelle strat directement d'ici : on choisit la map, elle est liée à la compo principale de la map
  const createOn = (m) => {
    const comps = Object.values(compositionsByMap[m.uuid] || {})
    const main = comps.find((c) => c.isMain) || comps[0] || null
    const id = createDraft({ mapUuid: m.uuid, compositionId: main?.id || null, name: `Strat ${(counts[m.uuid] || 0) + 1}`, side: 'attaque' })
    navigate(`/strat/${id}`)
  }

  return (
    <main className="strats container">
      <div className="strats__head">
        <div className="strats__head-row">
          <h1 className="strats__title">Strats</h1>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
              + Nouvelle strat
            </button>
          )}
        </div>
        <p>Setups, exécutions et retakes dessinés sur la minimap.</p>
      </div>
      {picking && (
        <div className="strats__picker" role="group" aria-label="Choisis la map de la nouvelle strat">
          <span className="eyebrow">Sur quelle map ?</span>
          <div className="strats__picker-grid">
            {sorted.map((m) => (
              <button key={m.uuid} type="button" className="strats__pick" onClick={() => createOn(m)} style={m.thumbnail ? { '--img': `url('${m.thumbnail}')` } : undefined}>
                <b>{m.name}</b>
                <small>{counts[m.uuid] ? `${counts[m.uuid]} strat${counts[m.uuid] > 1 ? 's' : ''}` : 'Aucune strat'}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {withStrats.length === 0 && !picking && <StratList />}
      {withStrats.map((m) => (
        <section key={m.uuid} className="strats__map">
          <div className="strats__map-head">
            <h2>{m.name}</h2>
            <Link to={`/editor/${m.uuid}#strats`} className="strats__open">Ouvrir la map →</Link>
          </div>
          <StratList mapUuid={m.uuid} comps={Object.values(compositionsByMap[m.uuid] || {})} />
        </section>
      ))}
      {without.length > 0 && (
        <div className="strats__others">
          <span className="eyebrow">Pas encore de strat</span>
          <div className="strats__chips">
            {without.map((m) => isAdmin ? (
              <button key={m.uuid} type="button" className="strats__chip" onClick={() => createOn(m)} title={`Nouvelle strat sur ${m.name}`}>+ {m.name}</button>
            ) : (
              <Link key={m.uuid} to={`/editor/${m.uuid}#strats`} className="strats__chip">{m.name}</Link>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
