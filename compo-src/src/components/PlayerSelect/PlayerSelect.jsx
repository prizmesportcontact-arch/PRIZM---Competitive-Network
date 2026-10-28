import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './PlayerSelect.css'

export default function PlayerSelect({ players, value, onChange, label }) {
  const playerList = Object.values(players).sort((a, b) => a.pseudo.localeCompare(b.pseudo))
  const current = value ? players[value] : null

  return (
    <div className="player-select">
      <PlayerAvatar player={current} size="sm" />
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label || 'Assigner un joueur'}
      >
        <option value="" data-avatar="">Aucun joueur</option>
        {playerList.map((p) => (
          <option
            key={p.id}
            value={p.id}
            data-color={p.color || '#9aa3af'}
            data-img={p.avatarUrl || undefined}
            data-initials={p.pseudo.trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
            data-sub={p.primaryRole || undefined}
          >
            {p.pseudo}
          </option>
        ))}
      </select>
    </div>
  )
}
