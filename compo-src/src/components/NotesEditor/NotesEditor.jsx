import './NotesEditor.css'

/** Zone de notes : le texte fait partie des changements à enregistrer de la composition. */
export default function NotesEditor({ value, onChange }) {
  return (
    <div className="notes-editor">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Stratégie générale, calls importants, timings, erreurs à éviter, objectifs…"
        rows={7}
      />
    </div>
  )
}
