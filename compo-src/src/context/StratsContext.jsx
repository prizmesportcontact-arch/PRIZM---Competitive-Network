import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from '../hooks/useLiveSync'
import { deleteStratRow, fetchStrats, insertStrat, rowToStrat, updateStratRow } from '../services/strats'
import { useToast } from './ToastContext'

const StratsContext = createContext(null)

/**
 * Strats de l'équipe, mises à jour en direct.
 * Les modifications restent en mémoire tant qu'on n'a pas cliqué « Enregistrer » :
 * - strats   : version affichée (avec les changements non enregistrés)
 * - saved    : dernière version enregistrée en base (pour « Partir sans enregistrer »)
 * - dirty    : strats modifiées mais pas encore enregistrées
 * Une strat en cours de modification ne se fait pas écraser par les mises à jour en direct.
 */
export function StratsProvider({ children }) {
  const { pushToast } = useToast()
  const [strats, setStrats] = useState({})
  const [status, setStatus] = useState('loading')
  const [dirty, setDirty] = useState(() => new Set())
  const saved = useRef({})
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const markDirty = useCallback((id, on) => {
    setDirty((prev) => {
      if (prev.has(id) === on) return prev
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const list = await fetchStrats()
      list.forEach((s) => { saved.current[s.id] = s })
      setStrats((prev) => {
        const next = Object.fromEntries(list.map((s) => [s.id, s]))
        // On garde les changements non enregistrés
        dirtyRef.current.forEach((id) => { if (prev[id] && next[id]) next[id] = prev[id] })
        return next
      })
      setStatus('ready')
    } catch (err) {
      console.error(err)
      setStatus((s) => (s === 'ready' ? s : 'error'))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useLiveSync(
    'strats',
    [
      {
        table: 'cb_strats',
        onUpsert: (payload) => {
          const s = rowToStrat(payload.new)
          saved.current[s.id] = s
          if (dirtyRef.current.has(s.id)) return
          setStrats((prev) => ({ ...prev, [s.id]: s }))
        },
        onDelete: (payload) =>
          setStrats((prev) => {
            if (!prev[payload.old.id]) return prev
            const next = { ...prev }
            delete next[payload.old.id]
            return next
          }),
      },
    ],
    load
  )

  const fail = useCallback(
    (err) => {
      console.error(err)
      pushToast(err?.message?.includes('row-level') ? "Tu n'as pas le droit de modifier les strats de l'équipe." : "La strat n'a pas pu être enregistrée.", 'error')
    },
    [pushToast]
  )

  const createStrat = useCallback(
    async (draft) => {
      try {
        const s = await insertStrat(draft)
        saved.current[s.id] = s
        setStrats((prev) => ({ ...prev, [s.id]: s }))
        return s.id
      } catch (err) {
        fail(err)
        return null
      }
    },
    [fail]
  )

  /** Modifie la strat à l'écran, sans l'enregistrer. */
  const patchLocal = useCallback(
    (id, patch) => {
      setStrats((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
      markDirty(id, true)
    },
    [markDirty]
  )

  /** Enregistre la version affichée. */
  const saveStrat = useCallback(
    async (id, current) => {
      try {
        const s = await updateStratRow(id, {
          name: current.name,
          side: current.side,
          steps: current.steps,
          compositionId: current.compositionId,
        })
        saved.current[id] = s
        markDirty(id, false)
        return true
      } catch (err) {
        fail(err)
        return false
      }
    },
    [fail, markDirty]
  )

  /** Oublie les changements non enregistrés. */
  const revertStrat = useCallback(
    (id) => {
      const s = saved.current[id]
      if (s) setStrats((prev) => ({ ...prev, [id]: s }))
      markDirty(id, false)
    },
    [markDirty]
  )

  const removeStrat = useCallback(
    async (id) => {
      try {
        await deleteStratRow(id)
        delete saved.current[id]
        markDirty(id, false)
        setStrats((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        return true
      } catch (err) {
        fail(err)
        return false
      }
    },
    [fail, markDirty]
  )

  const value = useMemo(
    () => ({ strats, status, dirty, createStrat, patchLocal, saveStrat, revertStrat, removeStrat, reload: load }),
    [strats, status, dirty, createStrat, patchLocal, saveStrat, revertStrat, removeStrat, load]
  )
  return <StratsContext.Provider value={value}>{children}</StratsContext.Provider>
}

export function useStrats() {
  const ctx = useContext(StratsContext)
  if (!ctx) throw new Error('useStrats doit être utilisé dans StratsProvider')
  return ctx
}
