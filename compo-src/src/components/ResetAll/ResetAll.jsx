import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCompositions } from '../../context/CompositionsContext'
import { useStrats } from '../../context/StratsContext'
import { useToast } from '../../context/ToastContext'
import { deleteAllStrats } from '../../services/strats'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import '../ConfirmDialog/ConfirmDialog.css'
import './ResetAll.css'

const WORD = 'RESET'

/**
 * Tout réinitialiser : supprime toutes les compos de l'équipe (et, si coché, toutes les strats).
 * Définitif : il faut taper RESET pour confirmer. Les joueurs et le roster ne sont pas touchés.
 */
export default function ResetAll({ compsCount, stratsCount }) {
  const { resetAll } = useCompositions()
  const { reload: reloadStrats } = useStrats()
  const { pushToast } = useToast()
  const [open, setOpen] = useState(false)
  const [withStrats, setWithStrats] = useState(true)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { if (!busy) { setOpen(false); setTyped('') } }
  useEscapeToClose(open, close)

  const run = async () => {
    setBusy(true)
    try {
      if (withStrats) await deleteAllStrats()
      await resetAll()
      if (withStrats) await reloadStrats()
      pushToast(withStrats ? 'Compos et strats réinitialisées.' : 'Compos réinitialisées.', 'success')
      setOpen(false)
      setTyped('')
    } catch (err) {
      console.error(err)
      pushToast('Impossible de tout réinitialiser.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="reset-all glass-panel">
        <div>
          <b>Tout réinitialiser</b>
          <span>Supprime toutes les compos de l'équipe{stratsCount ? ' et, si tu veux, toutes les strats' : ''}. Le roster et les rôles des joueurs ne changent pas.</span>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)} disabled={!compsCount && !stratsCount}>Tout réinitialiser</button>
      </section>

      <AnimatePresence>
        {open && (
          <motion.div className="confirm-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
            <motion.form
              className="confirm-dialog glass-panel reset-all__dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reset-title"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => { e.preventDefault(); if (typed.trim().toUpperCase() === WORD && !busy) run() }}
            >
              <h3 id="reset-title">Tout réinitialiser ?</h3>
              <p>
                {compsCount} compo{compsCount > 1 ? 's' : ''} {compsCount > 1 ? 'seront supprimées' : 'sera supprimée'} pour toute l'équipe.
                C'est définitif, impossible de revenir en arrière.
              </p>
              {stratsCount > 0 && (
                <label className="reset-all__check">
                  <input type="checkbox" checked={withStrats} onChange={(e) => setWithStrats(e.target.checked)} />
                  {stratsCount > 1 ? `Supprimer aussi les ${stratsCount} strats` : 'Supprimer aussi la strat'}
                </label>
              )}
              <label className="reset-all__type">
                <span>Tape <b>{WORD}</b> pour confirmer</span>
                <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
              </label>
              <div className="confirm-dialog__actions">
                <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Annuler</button>
                <button type="submit" className="btn btn-danger" disabled={typed.trim().toUpperCase() !== WORD || busy}>
                  {busy ? 'Suppression…' : 'Tout supprimer'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
