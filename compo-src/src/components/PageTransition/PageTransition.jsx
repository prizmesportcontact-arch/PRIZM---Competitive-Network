import './PageTransition.css'

/**
 * Enveloppe une page : simple fondu à l'arrivée, en CSS.
 * (L'ancienne version animait aussi la sortie avec Framer Motion ; combinée au chargement
 * des pages à la demande, cette sortie restait parfois bloquée et la page restait vide.)
 */
export default function PageTransition({ children }) {
  return <div className="page-enter">{children}</div>
}
