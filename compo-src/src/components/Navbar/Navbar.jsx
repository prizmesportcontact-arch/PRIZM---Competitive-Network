import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import GlobalSearch from '../GlobalSearch/GlobalSearch'
import AuthPanel from '../AuthPanel/AuthPanel'
import { networkUrl } from '../../services/team'
import './Navbar.css'

// Même menu du haut que le site du réseau : on reste « chez PRIZM ».
const NETWORK_LINKS = [
  ['#/espace', 'Mon équipe'],
  ['#/scrims', 'Scrims'],
  ['#/recherche', 'Recherche'],
  ['#/classement', 'Classement'],
  ['#/equipes', 'Équipes'],
  ['#/reglement', 'Règlement'],
]

export default function Navbar() {
  return (
    <header className="pz-top">
      <div className="pz-wrap pz-top__row">
        <a href={networkUrl('#/reseau')} className="pz-top__brand" aria-label="PRIZM Competitive Network, accueil du réseau">
          <img src="../logo.png" alt="PRIZM Competitive Network" />
        </a>
        <nav className="pz-top__nav" aria-label="Competitive Network">
          {NETWORK_LINKS.map(([hash, label]) => (
            <a key={hash} href={networkUrl(hash)} className={hash === '#/espace' ? 'on' : ''}>
              {label}
            </a>
          ))}
        </nav>
        <AuthPanel />
      </div>
    </header>
  )
}

// Menu « Mon équipe » : le même que sur le site (Tableau de bord, Nos scrims, Compos…)
const ICONS = {
  espace: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  scrims: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  compos: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  strats: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  roster: 'M4 6h16v12H4zM8 10h3M8 14h8M15 10h1',
  reglages: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
}
const Icon = ({ k }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[k]} />
  </svg>
)
const DIV_NAMES = { 1: 'D1 · Élite', 2: 'D2 · Haute', 3: 'D3 · Inter', 4: 'D4 · Open' }

export function TeamSide() {
  const { team } = useAuth()
  const { pathname } = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const inCompos = pathname === '/' || pathname.startsWith('/editor')
  const status = team?.status === 'validee' ? ['ok', DIV_NAMES[team.division] || 'Validée'] : team?.status === 'refusee' ? ['bad', 'Refusée'] : ['wait', 'En attente de validation']
  const ext = (k, hash, label) => (
    <a className="tm-link" href={networkUrl(hash)}>
      <Icon k={k} />
      <span>{label}</span>
    </a>
  )
  const int = (k, to, label, on, sub) => (
    <NavLink to={to} className={() => `tm-link${sub ? ' sub' : ''}${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
      {!sub && <Icon k={k} />}
      <span>{label}</span>
    </NavLink>
  )

  return (
    <aside className="tm-side">
      {team && (
        <a className="tm-id" href={networkUrl(`#/equipe/${encodeURIComponent(team.tag || '')}`)} title="Page publique de l'équipe">
          {team.logo_url ? <img className="tm-logo" src={team.logo_url} alt="" /> : <span className="tm-logo tm-logo--txt">{team.tag}</span>}
          <span>
            <b>{team.name}</b>
            <small className={status[0]}>{status[1]}</small>
          </span>
        </a>
      )}
      <nav className="tm-nav" aria-label="Mon équipe">
        {ext('espace', '#/espace', 'Tableau de bord')}
        {ext('scrims', '#/nos-scrims', 'Nos scrims')}
        {int('compos', '/', 'Compos', inCompos)}
        {int('strats', '/strats', 'Strats', pathname.startsWith('/strats'))}
        {ext('roster', '#/mon-equipe', 'Roster')}
        {ext('reglages', '#/reglages', 'Réglages')}
      </nav>
      <button type="button" className="tm-search" onClick={() => setSearchOpen(true)}>
        <Icon k="search" />
        <span>Rechercher</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </aside>
  )
}
