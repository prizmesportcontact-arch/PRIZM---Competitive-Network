import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useStrats } from '../../context/StratsContext'
import { useAuth } from '../../context/AuthContext'
import { formatRelativeDate } from '../../utils/compositions'
import StratBoard from '../StratBoard/StratBoard'
import './StratList.css'

/**
 * Strats d'une map (ou de toutes les maps si mapUuid est absent).
 * compositionId : compo affichée, liée d'office à une nouvelle strat.
 */
export default function StratList({ mapUuid, compositionId = null, comps = [], showMap = false }) {
  const { strats, status, createStrat } = useStrats()
  const { maps, agents } = useData()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const agentByUuid = useMemo(() => new Map(agents.map((a) => [a.uuid, a])), [agents])
  const mapByUuid = useMemo(() => new Map(maps.map((m) => [m.uuid, m])), [maps])
  const compName = (id) => comps.find((c) => c.id === id)?.name

  const list = Object.values(strats)
    .filter((s) => !mapUuid || s.mapUuid === mapUuid)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const create = async () => {
    setCreating(true)
    const id = await createStrat({ mapUuid, compositionId, name: `Strat ${list.length + 1}`, side: 'attaque' })
    setCreating(false)
    if (id) navigate(`/strat/${id}`)
  }

  if (status === 'loading') return <p className="strat-list__muted">Chargement des strats…</p>

  return (
    <div className="strat-list">
      {list.length === 0 && (
        <p className="strat-list__muted">
          {mapUuid ? 'Aucune strat sur cette map pour l’instant.' : 'Aucune strat pour l’instant : ouvre une map et crée la première.'}
          {mapUuid && isAdmin ? ' Dessine un setup, une exécution ou une retake sur la minimap.' : ''}
        </p>
      )}
      <div className="strat-list__grid">
        {list.map((s) => {
          const m = mapByUuid.get(s.mapUuid)
          const first = s.steps[0]
          return (
            <Link key={s.id} to={`/strat/${s.id}`} className="strat-card">
              <div className="strat-card__preview">
                <StratBoard mini minimap={m?.minimap} flipped={s.flipped} side={s.side} items={first?.items || []} agentByUuid={agentByUuid} />
              </div>
              <div className="strat-card__body">
                <span className={`strat-card__side ${s.side}`}>{s.side === 'defense' ? 'Défense' : 'Attaque'}</span>
                <b className="strat-card__name">{s.name}</b>
                <span className="strat-card__meta">
                  {showMap && m ? `${m.name} · ` : ''}
                  {s.steps.length} étape{s.steps.length > 1 ? 's' : ''}
                  {compName(s.compositionId) ? ` · ${compName(s.compositionId)}` : ''}
                </span>
                <span className="strat-card__date">{formatRelativeDate(s.updatedAt)}</span>
              </div>
            </Link>
          )
        })}
        {mapUuid && isAdmin && (
          <button type="button" className="strat-card strat-card--new" onClick={create} disabled={creating}>
            <span aria-hidden="true">+</span>
            {creating ? 'Création…' : 'Nouvelle strat'}
          </button>
        )}
      </div>
    </div>
  )
}
