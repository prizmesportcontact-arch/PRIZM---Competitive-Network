import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import './LeaveGuard.css'

/** Fenêtre « Êtes-vous sûr de partir sans enregistrer ? » (voir hooks/useUnsavedGuard). */
export default function LeaveGuard({ open, label, busy, leaving = true, onSave, onDiscard, onStay }) {
  useEscapeToClose(open, onStay)
  if (!open) return null
  return (
    <div className="leave-guard" role="dialog" aria-modal="true" aria-labelledby="leave-guard-title" onClick={onStay}>
      <div className="leave-guard__box" onClick={(e) => e.stopPropagation()}>
        <h2 id="leave-guard-title">Êtes-vous sûr de partir sans enregistrer ?</h2>
        <p>Les modifications{label ? <> de « {label} »</> : ''} ne sont pas enregistrées. Si tu continues sans enregistrer, elles seront perdues.</p>
        <div className="leave-guard__actions">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
            {busy ? 'Enregistrement…' : leaving ? 'Enregistrer et partir' : 'Enregistrer et continuer'}
          </button>
          <button type="button" className="btn btn-danger" onClick={onDiscard} disabled={busy}>
            {leaving ? 'Partir sans enregistrer' : 'Continuer sans enregistrer'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onStay} disabled={busy} autoFocus>Rester</button>
        </div>
      </div>
    </div>
  )
}
