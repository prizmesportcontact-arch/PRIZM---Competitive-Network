import './CompMosaic.css'

const ROLE_VAR = {
  Duelliste: 'var(--role-duelist)',
  Duelist: 'var(--role-duelist)',
  Contrôleur: 'var(--role-controller)',
  Controller: 'var(--role-controller)',
  Initiateur: 'var(--role-initiator)',
  Initiator: 'var(--role-initiator)',
  Sentinelle: 'var(--role-sentinel)',
  Sentinel: 'var(--role-sentinel)',
}

/**
 * Image d'une compo sans map : les portraits des agents côte à côte, en bandes inclinées,
 * chacune teintée de la couleur du rôle. Les places vides restent sombres.
 */
export default function CompMosaic({ slots = [], agentByUuid }) {
  const picked = slots.map((s) => (s?.agentUuid ? agentByUuid?.get(s.agentUuid) : null))
  const any = picked.some(Boolean)
  return (
    <div className={`comp-mosaic${any ? '' : ' comp-mosaic--empty'}`} aria-hidden="true">
      {any &&
        picked.map((a, i) => (
          <div key={i} className="comp-mosaic__band" style={{ '--role': a ? ROLE_VAR[a.role?.name] || 'var(--role-flex)' : 'transparent' }}>
            {a && <img src={a.portrait || a.icon} alt="" loading="lazy" decoding="async" />}
          </div>
        ))}
    </div>
  )
}
