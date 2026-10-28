import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { StatusDot } from '../StatusBadge/StatusBadge'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import CompMosaic from '../CompMosaic/CompMosaic'
import { countFilled, formatRelativeDate } from '../../utils/compositions'
import { STATUS_META } from '../../utils/storage'
import '../MapCard/MapCard.css'

/** Carte d'une compo sans map : même forme qu'une carte de map, l'image est faite des agents. */
export default function CompCard({ comp, mapUuid, agentByUuid, players, index = 0 }) {
  const filled = countFilled(comp)
  const assigned = comp.slots.map((s) => (s.playerId ? players[s.playerId] : null)).filter(Boolean)
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4), ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={`/editor/${mapUuid}?comp=${comp.id}`}
        className="map-card glass-panel accent-card"
        style={{ '--accent-card-color': STATUS_META[comp.status]?.color || 'var(--text-tertiary)' }}
      >
        <div className="map-card__image-wrap">
          <CompMosaic slots={comp.slots} agentByUuid={agentByUuid} />
          <div className="map-card__scrim" />
          <span className={`map-card__count ${filled === 5 ? 'map-card__count--full' : ''}`}>{filled}/5</span>
          <span className="map-card__comps-count">Sans map</span>
        </div>
        <div className="map-card__body">
          <div className="map-card__top-row">
            <h3 className="map-card__name">{comp.name}</h3>
            {comp.status && <StatusDot status={comp.status} size="sm" />}
          </div>
          <div className="map-card__bottom-row">
            <div className="map-card__players">
              {assigned.length > 0 ? (
                assigned.slice(0, 5).map((p, i) => <PlayerAvatar key={p.id + i} player={p} size="sm" />)
              ) : (
                <span className="map-card__no-players">Aucun joueur assigné</span>
              )}
            </div>
            <span className="map-card__updated">{formatRelativeDate(comp.updatedAt)}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/** Premier emplacement de la grille : créer une compo de A à Z. */
export function AddCompCard({ onClick }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <button type="button" className="map-card glass-panel add-comp-card" onClick={onClick}>
        <span className="add-comp-card__plus" aria-hidden="true">+</span>
        <b>Ajouter une compo</b>
        <span>Choisis le nom, les agents et la map (ou aucune)</span>
      </button>
    </motion.div>
  )
}
