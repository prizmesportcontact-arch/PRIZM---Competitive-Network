import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSync } from '../hooks/useLiveSync'
import { deleteDocRow, EMPTY_DOC, fetchDocs, insertDoc, rowToDoc, updateDocRow } from '../services/docs'
import { uid } from '../services/strats'
import { useToast } from './ToastContext'

const DocsContext = createContext(null)

/**
 * Pages du Playbook, mises à jour en direct. Même fonctionnement que les strats :
 * rien ne s'enregistre tout seul. Une nouvelle page (id « draft-… ») n'existe dans la base
 * qu'à son premier « Enregistrer ». Une page en cours de modification n'est pas écrasée
 * par les mises à jour en direct.
 */
export function DocsProvider({ children }) {
  const { pushToast } = useToast()
  const [docs, setDocs] = useState({})
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
      const list = await fetchDocs()
      list.forEach((d) => { saved.current[d.id] = d })
      setDocs((prev) => {
        const next = Object.fromEntries(list.map((d) => [d.id, d]))
        dirtyRef.current.forEach((id) => { if (prev[id] && (next[id] || id.startsWith('draft-'))) next[id] = prev[id] })
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
    'docs',
    [
      {
        table: 'cb_docs',
        onUpsert: (payload) => {
          const d = rowToDoc(payload.new)
          saved.current[d.id] = d
          if (dirtyRef.current.has(d.id)) return
          setDocs((prev) => ({ ...prev, [d.id]: d }))
        },
        onDelete: (payload) =>
          setDocs((prev) => {
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
      const m = err?.message || ''
      pushToast(
        m.includes('row-level') ? "Tu n'as pas le droit de modifier le playbook de l'équipe."
          : m.includes('Limite') ? m
          : m.includes('pg_column_size') || m.includes('check constraint') ? 'Page trop longue : découpe-la en plusieurs pages.'
          : "La page n'a pas pu être enregistrée.",
        'error'
      )
    },
    [pushToast]
  )

  /** Nouvelle page : elle n'existe qu'à l'écran jusqu'au premier « Enregistrer ». */
  const createDraft = useCallback(
    ({ mapUuid = null, title = 'Nouvelle page', content = EMPTY_DOC }) => {
      const id = `draft-${uid()}`
      const now = Date.now()
      setDocs((prev) => ({ ...prev, [id]: { id, draft: true, mapUuid, title, content, createdAt: now, updatedAt: now } }))
      markDirty(id, true)
      return id
    },
    [markDirty]
  )

  /** Modifie la page à l'écran, sans l'enregistrer. */
  const patchLocal = useCallback(
    (id, patch) => {
      setDocs((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
      markDirty(id, true)
    },
    [markDirty]
  )

  /** Enregistre la version affichée. Renvoie l'id enregistré (nouveau pour un brouillon), ou null. */
  const saveDoc = useCallback(
    async (id, current) => {
      try {
        const title = (current.title || '').trim().slice(0, 80) || 'Sans titre'
        if (id.startsWith('draft-')) {
          const d = await insertDoc({ mapUuid: current.mapUuid, title, content: current.content })
          saved.current[d.id] = d
          markDirty(id, false)
          setDocs((prev) => {
            const next = { ...prev, [d.id]: d }
            delete next[id]
            return next
          })
          return d.id
        }
        const d = await updateDocRow(id, { title, content: current.content, mapUuid: current.mapUuid })
        saved.current[id] = d
        setDocs((prev) => ({ ...prev, [id]: d }))
        markDirty(id, false)
        return id
      } catch (err) {
        fail(err)
        return null
      }
    },
    [fail, markDirty]
  )

  /** Oublie les changements non enregistrés. */
  const revertDoc = useCallback(
    (id) => {
      const d = saved.current[id]
      if (id.startsWith('draft-')) {
        setDocs((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      } else if (d) setDocs((prev) => ({ ...prev, [id]: d }))
      markDirty(id, false)
    },
    [markDirty]
  )

  const removeDoc = useCallback(
    async (id) => {
      try {
        if (!id.startsWith('draft-')) await deleteDocRow(id)
        delete saved.current[id]
        markDirty(id, false)
        setDocs((prev) => {
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
    () => ({ docs, status, dirty, createDraft, patchLocal, saveDoc, revertDoc, removeDoc, reload: load }),
    [docs, status, dirty, createDraft, patchLocal, saveDoc, revertDoc, removeDoc, load]
  )
  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>
}

export function useDocs() {
  const ctx = useContext(DocsContext)
  if (!ctx) throw new Error('useDocs doit être utilisé dans DocsProvider')
  return ctx
}
