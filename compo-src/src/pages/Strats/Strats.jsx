import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useStrats } from '../../context/StratsContext'
import { useCompositions } from '../../context/CompositionsContext'
import StratList from '../../components/StratList/StratList'
import './Strats.css'

/** Toutes les strats de l'équipe, rangées par map */
export default function Strats() {
  const { maps } = useData()
  const { strats } = useStrats()
  const { compositionsByMap } = useCompositions()
  const realMaps = maps.filter((m) => !m.free && m.minimap)
  const counts = useMemo(() => {
    const c = {}
    Object.values(strats).forEach((s) => { c[s.mapUuid] = (c[s.mapUuid] || 0) + 1 })
    return c
  }, [strats])
  const withStrats = realMaps.filter((m) => counts[m.uuid])
  const without = realMaps.filter((m) => !counts[m.uuid])

  return (
    <main className="strats container">
      <div className="strats__head">
        <h1 className="strats__title">Strats</h1>
        <p>Setups, exécutions et retakes dessinés sur la minimap. Choisis une map pour en créer une.</p>
      </div>
      {withStrats.length === 0 && <StratList />}
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
            {without.map((m) => (
              <Link key={m.uuid} to={`/editor/${m.uuid}#strats`} className="strats__chip">{m.name}</Link>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
