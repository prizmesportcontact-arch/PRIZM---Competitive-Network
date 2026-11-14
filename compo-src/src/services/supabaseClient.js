import { createClient } from '@supabase/supabase-js'

// Même base que le site du PRIZM Competitive Network : la connexion
// Discord est partagée (on se connecte une fois, sur le site ou ici).
// Ces deux valeurs sont publiques par nature (elles finissent dans le
// JavaScript envoyé au navigateur) ; la sécurité repose sur les règles
// RLS de la base. Le .env reste prioritaire pour un test en local.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cbbnrdfvaaikawszaysu.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rfB8KSptjcdTpp8QxvST9A_UlpQ8rW0'

// flowType 'pkce' : la connexion Discord renvoie un ?code=… dans l'URL
// plutôt qu'un #access_token=…, qui entrerait en collision avec le
// routage par # (HashRouter ici, routes #/… sur le site du réseau).
// Verrou de session partagé avec le site : repris au bout de 4 s s'il n'est jamais rendu
// (onglet en veille…), au lieu de bloquer toutes les requêtes
const lock = async (name, _timeout, fn) => {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  try {
    return await navigator.locks.request(name, { mode: 'exclusive', signal: ctrl.signal }, () => { clearTimeout(t); return fn() })
  } catch (e) {
    clearTimeout(t)
    if (e && e.name === 'AbortError') return navigator.locks.request(name, { steal: true }, () => fn())
    throw e
  }
}

// Après une mise en veille, une requête peut rester bloquée sur une connexion « morte » :
// une lecture (GET) sans réponse en 7 s est relancée, jusqu'à 2 fois. Les écritures ne sont jamais relancées.
const netFetch = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return fetch(url, opts)
  for (let i = 0; i < 3; i++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), [7000, 10000, 15000][i])
    const onAbort = () => ctrl.abort()
    if (opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true })
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal })
    } catch (e) {
      if ((opts.signal && opts.signal.aborted) || i === 2) throw e
    } finally {
      clearTimeout(t)
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: netFetch },
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, lock },
  // Peu de messages temps réel par seconde suffisent largement ici
  realtime: { params: { eventsPerSecond: 5 } },
})

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
