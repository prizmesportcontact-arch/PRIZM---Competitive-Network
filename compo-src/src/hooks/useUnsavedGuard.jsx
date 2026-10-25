import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import LeaveDialog from '../components/LeaveGuard/LeaveGuard'

/**
 * Rien ne s'enregistre tout seul : tant que `when` est vrai, quitter la page
 * (onglet du menu, lien, bouton Retour du navigateur, lien vers le site, fermeture de l'onglet)
 * ou lancer une action protégée par `guard(fn)` affiche « Êtes-vous sûr de partir sans enregistrer ? ».
 *  - onSave()    : enregistre, renvoie true si c'est fait
 *  - onDiscard() : oublie les changements
 * Renvoie { guard, allow, dialog } : `dialog` est à placer dans la page, `allow()` laisse
 * passer la prochaine navigation (après une suppression, par ex.).
 */
export function useUnsavedGuard({ when, label, onSave, onDiscard }) {
  const whenRef = useRef(when)
  const bypass = useRef(false)
  const [pending, setPending] = useState(null) // { kind: 'block' | 'href' | 'action', href?, run? }
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    whenRef.current = when
  }, [when])

  // Navigation dans l'app (menu, liens, Retour/Suivant du navigateur)
  const blocker = useBlocker(
    useCallback(({ currentLocation, nextLocation }) => {
      if (bypass.current || !whenRef.current) return false
      return currentLocation.pathname !== nextLocation.pathname
    }, [])
  )
  const navigate = useNavigate()
  const blockerRef = useRef(blocker)
  useEffect(() => {
    blockerRef.current = blocker
    if (blocker.state === 'blocked') setPending((p) => p || { kind: 'block', to: blocker.location })
  }, [blocker])

  // Fermer l'onglet ou recharger : le navigateur demande confirmation
  useEffect(() => {
    if (!when) return undefined
    const onBeforeUnload = (e) => {
      if (bypass.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])

  // Liens qui sortent du Comp Builder (menu du site) : même fenêtre que dans l'app
  useEffect(() => {
    if (!when) return undefined
    const onClick = (e) => {
      const a = e.target.closest && e.target.closest('a[href]')
      if (!a || a.target === '_blank' || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return
      const url = new URL(a.href, window.location.href)
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return // géré par le routeur
      e.preventDefault()
      e.stopPropagation()
      setPending({ kind: 'href', href: url.href })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [when])

  const guard = useCallback((run) => {
    if (!whenRef.current) return run()
    setPending({ kind: 'action', run })
    return undefined
  }, [])

  const allow = useCallback(() => {
    bypass.current = true
    setTimeout(() => { bypass.current = false }, 0)
  }, [])

  const proceed = (p) => {
    setPending(null)
    // Les changements viennent d'être enregistrés ou abandonnés : on laisse passer
    whenRef.current = false
    bypass.current = true
    setTimeout(() => { bypass.current = false }, 300)
    if (p.kind === 'block') {
      const b = blockerRef.current
      if (b.state === 'blocked') b.proceed()
      else if (p.to) navigate(p.to) // blocage levé entre-temps : on refait la navigation
    } else if (p.kind === 'href') {
      window.location.assign(p.href)
    } else {
      p.run()
    }
  }

  const stay = () => {
    const b = blockerRef.current
    if (pending?.kind === 'block' && b.state === 'blocked') b.reset()
    setPending(null)
  }

  const dialog = (
    <LeaveDialog
      open={Boolean(pending)}
      label={label}
      busy={busy}
      leaving={pending?.kind !== 'action'}
      onSave={async () => {
        const p = pending
        setBusy(true)
        const ok = await onSave()
        setBusy(false)
        if (ok) proceed(p)
      }}
      onDiscard={() => {
        const p = pending
        onDiscard()
        proceed(p)
      }}
      onStay={stay}
    />
  )

  return { guard, allow, dialog }
}
