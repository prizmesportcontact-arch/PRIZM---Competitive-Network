import { networkUrl } from './services/team'
import { Suspense, lazy } from 'react'
import { useEffect } from 'react'
import { Navigate, Route, RouterProvider, Routes, createHashRouter, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ThemeProvider } from './context/ThemeContext'
import { SoundProvider } from './context/SoundContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { CompositionsProvider } from './context/CompositionsContext'
import { PlayersProvider } from './context/PlayersContext'
import { StratsProvider } from './context/StratsContext'
import { ToastProvider } from './context/ToastContext'
import { isSupabaseConfigured } from './services/supabaseClient'
import Navbar, { TeamSide } from './components/Navbar/Navbar'
import RouteProgress from './components/RouteProgress/RouteProgress'
import PageTransition from './components/PageTransition/PageTransition'
import Loader from './components/Loader/Loader'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary'
import TeamGate from './components/TeamGate/TeamGate'

// Chaque page dans son propre chunk : le premier chargement ne télécharge
// que la page demandée, pas les 6 à la fois (le bundle faisait ~590 Ko
// d'un seul bloc auparavant).
const Home = lazy(() => import('./pages/Home/Home'))
const Editor = lazy(() => import('./pages/Editor/Editor'))
const Strats = lazy(() => import('./pages/Strats/Strats'))
const Strat = lazy(() => import('./pages/Strat/Strat'))

/** Rendu à l'intérieur du routeur : gère la transition animée entre les pages. */
function AppRoutes() {
  const location = useLocation()

  // Chaque page a son propre Suspense : pendant le chargement de son code, seul son contenu
  // affiche « Chargement… », le reste de l'écran (menus) ne bouge pas.
  const pageFallback = <div className="container"><Loader label="Chargement…" /></div>

  return (
    // Plus d'animation de sortie entre les pages : avec les pages chargées à la demande, elle restait
    // parfois bloquée et laissait la zone vide. Chaque page apparaît juste en fondu (voir PageTransition).
    <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Suspense fallback={pageFallback}><Home /></Suspense></PageTransition>} />
        <Route path="/editor/:mapId" element={<PageTransition><Suspense fallback={pageFallback}><Editor /></Suspense></PageTransition>} />
        <Route path="/team" element={<ToRoster />} />
        <Route path="/strats" element={<PageTransition><Suspense fallback={pageFallback}><Strats /></Suspense></PageTransition>} />
        <Route path="/strat/:stratId" element={<PageTransition><Suspense fallback={pageFallback}><Strat /></Suspense></PageTransition>} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        {/* Toute URL inconnue renvoie vers l'accueil plutôt que sur une page blanche. */}
        <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Mise en page commune, rendue par le routeur. */
function ShellLayout() {
  // Sur le tableau tactique, la carte prend toute la place : pas de menu sur le côté
  const full = useLocation().pathname.startsWith('/strat/')
  return (
    // reducedMotion="user" : respecte le réglage système "Réduire les animations"
    // pour les animations Framer Motion (pilotées en JS, non couvertes par le CSS).
    <MotionConfig reducedMotion="user">
      <RouteProgress />
      <div className="app-layout">
        <Navbar />
        <div className={`tm-layout${full ? ' tm-layout--full' : ''}`}>
          {!full && <TeamSide />}
          <div className="app-layout__main">
            <AppRoutes />
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}

// Routeur « data » : nécessaire pour bloquer une navigation quand une page n'est pas
// enregistrée (useBlocker, y compris le bouton Retour du navigateur).
let router = null
const getRouter = () => (router ||= createHashRouter([{ path: '*', element: <ShellLayout /> }]))

/** Rendu à l'intérieur de tous les providers, pour pouvoir utiliser leurs hooks. */
function AppShell() {
  return <RouterProvider router={getRouter()} future={{ v7_startTransition: true }} />
}

/** Écran affiché si le fichier .env est manquant ou incomplet — voir README. */
function SupabaseSetupNotice() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0b1119', color: '#ece8e1', fontFamily: 'system-ui, sans-serif', padding: 24,
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.3rem', marginBottom: 12 }}>Configuration Supabase manquante</h1>
        <p style={{ color: '#97a3ad', lineHeight: 1.6 }}>
          Le fichier <code>.env</code> n'existe pas encore, ou il lui manque
          <code> VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>.
          Copiez <code>.env.example</code> en <code>.env</code>, remplissez les deux valeurs
          depuis votre projet Supabase, puis relancez <code>npm run dev</code>.
          Voir le README, section « Connecter Supabase ».
        </p>
      </div>
    </div>
  )
}

/**
 * Données de l'équipe : tout est rechargé de zéro si la personne change
 * d'équipe (key = id de l'équipe).
 */
function TeamScopedApp() {
  const { team } = useAuth()
  return (
    <DataProvider key={team.id}>
      <PlayersProvider>
        <CompositionsProvider>
          <StratsProvider>
            <AppShell />
          </StratsProvider>
        </CompositionsProvider>
      </PlayersProvider>
    </DataProvider>
  )
}

// Les joueurs (rôles, couleurs, joueurs sans compte) se gèrent dans le Roster du site
function ToRoster() {
  useEffect(() => { window.location.replace(networkUrl('#/mon-equipe')) }, [])
  return null
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <SupabaseSetupNotice />
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SoundProvider>
          <ToastProvider>
            <AuthProvider>
              <TeamGate>
                <TeamScopedApp />
              </TeamGate>
            </AuthProvider>
          </ToastProvider>
        </SoundProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
