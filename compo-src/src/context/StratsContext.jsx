import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from '../hooks/useLiveSync'
import { deleteStratRow, fetchStrats, insertStrat, rowToStrat, updateStratRow } from '../services/strats'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

const StratsContext = createContext(null)

/**
 * Strats de l'équipe, gardées en mémoire et mises à jour en direct.
 * Pendant qu'on modifie une strat, on ignore l'écho de nos propres
 * sauvegardes (sinon le dessin « sauterait » en arrière).
 */
export function StratsProvider({ children }) {
  const { pushToast } = useToast()
  const { user } = useAuth()
  const [strats, setStrats] = useState({})
  const [status, setStatus] = useState('loading')
  const editingRef = useRef(null) // id de la strat ouverte en édition ici

  const merge = useCallback((s) => setStrats((prev) => ({ ...prev, [s.id]: s })), [])

  const load = useCallback(async () => {
    try {
      const list = await fetchStrats()
      setStrats(Object.fromEntries(list.map((s) => [s.id, s])))
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
          if (editingRef.current === s.id && s.updatedBy === user?.id) return
          merge(s)
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
        merge(s)
        return s.id
      } catch (err) {
        fail(err)
        return null
      }
    },
    [merge, fail]
  )

  // Mise à jour locale immédiate ; l'appel réseau est fait par l'éditeur (sauvegarde différée)
  const patchLocal = useCallback((id, patch) => {
    setStrats((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
  }, [])

  const saveStrat = useCallback(
    async (id, patch) => {
      try {
        await updateStratRow(id, patch)
        return true
      } catch (err) {
        fail(err)
        return false
      }
    },
    [fail]
  )

  const removeStrat = useCallback(
    async (id) => {
      try {
        await deleteStratRow(id)
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
    [fail]
  )

  const setEditing = useCallback((id) => {
    editingRef.current = id
  }, [])

  const value = useMemo(
    () => ({ strats, status, createStrat, patchLocal, saveStrat, removeStrat, setEditing, reload: load }),
    [strats, status, createStrat, patchLocal, saveStrat, removeStrat, setEditing, load]
  )
  return <StratsContext.Provider value={value}>{children}</StratsContext.Provider>
}

export function useStrats() {
  const ctx = useContext(StratsContext)
  if (!ctx) throw new Error('useStrats doit être utilisé dans StratsProvider')
  return ctx
}
