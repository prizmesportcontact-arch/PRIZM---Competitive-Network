import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchAgents, fetchMaps } from '../services/valorantApi'

// Compos qui ne dépendent d'aucune map (compo de base, compo anti-éco…)
export const FREE_MAP = { uuid: 'libre', name: 'Sans map', image: null, thumbnail: null, minimap: null, free: true }

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [maps, setMaps] = useState([])
  const [agents, setAgents] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [mapsData, agentsData] = await Promise.all([
        fetchMaps(),
        fetchAgents(),
      ])
      setMaps([FREE_MAP, ...mapsData])
      setAgents(agentsData)
      setStatus('ready')
    } catch (err) {
      setError(err.message || 'Une erreur inconnue est survenue.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <DataContext.Provider value={{ maps, agents, status, error, reload: load }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData doit être utilisé dans DataProvider')
  return ctx
}
