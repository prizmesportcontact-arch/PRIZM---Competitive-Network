import { useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useClickOutside } from '../../hooks/useClickOutside'
import discordMark from '../../assets/discord-mark.png'
import { networkUrl } from '../../services/team'
import './AuthPanel.css'

/**
 * Icône utilisée pour le bouton "Connexion Discord" (pas encore connecté) —
 * le même fichier que le badge affiché sur l'avatar une fois connecté (voir
 * PlayerAvatar/showDiscordBadge), pour ne garder qu'une seule image à
 * remplacer si besoin : src/assets/discord-mark.png.
 */
function DiscordMark({ size = 15 }) {
  return <img src={discordMark} alt="" style={{ height: size, width: 'auto', display: 'block' }} />
}

/**
 * Seule porte d'entrée : connexion Discord (voir AuthContext.signInWithDiscord).
 * Une fois connecté, affiche l'avatar/pseudo du joueur (pas juste un badge
 * générique "Connecté") avec un petit point vert = connecté via Discord,
 * et un anneau doré = administrateur — cliquer ouvre une mini fenêtre de
 * profil (fiche joueur + déconnexion), sans routing/page dédiée.
 */
// Même bouton de compte que sur le site du réseau (avatar Discord + pseudo, même menu) :
// on ne doit pas voir de différence en passant du site au Comp Builder.
export default function AuthPanel() {
  const { user, profile, signInWithDiscord, signOut } = useAuth()
  const { pushToast } = useToast()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEscapeToClose(open, () => setOpen(false))
  useClickOutside(wrapRef, open, () => setOpen(false))

  if (!user) {
    const handleLogin = async () => {
      const error = await signInWithDiscord()
      if (error) pushToast(`Connexion Discord impossible : ${error.message}`, 'error')
    }
    return (
      <button className="btn btn-ghost auth-panel auth-panel__discord" onClick={handleLogin}>
        <DiscordMark size={15} />
        Connexion
      </button>
    )
  }

  const name = profile?.username || user.user_metadata?.custom_claims?.global_name || user.user_metadata?.full_name || 'Mon compte'
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || null
  const staff = Boolean(profile?.is_admin || profile?.staff_role)

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
    pushToast('Déconnecté.', 'success')
  }

  return (
    <div className="auth-panel me" ref={wrapRef}>
      <button type="button" className="me-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        {avatarUrl ? (
          <img className="me-av" src={avatarUrl} alt="" width="30" height="30" referrerPolicy="no-referrer" />
        ) : (
          <span className="me-av me-av--txt">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <span className="me-name">{name}</span>
      </button>
      {open && (
        <div className="me-menu">
          <a href={networkUrl('#/espace')}>Mon équipe</a>
          <a href={networkUrl('#/profil')}>Mon profil</a>
          {profile?.is_admin ? <a href={networkUrl('#/admin')}>Admin</a> : staff ? <a href={networkUrl('#/scrims')}>Modération des scrims</a> : null}
          <button type="button" onClick={handleSignOut}>Déconnexion</button>
        </div>
      )}
    </div>
  )
}
