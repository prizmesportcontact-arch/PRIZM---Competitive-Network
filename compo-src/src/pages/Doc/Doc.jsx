import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import LinkExt from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useDocs } from '../../context/DocsContext'
import { useData } from '../../context/DataContext'
import { useStrats } from '../../context/StratsContext'
import { useCompositions } from '../../context/CompositionsContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard'
import { useClickOutside } from '../../hooks/useClickOutside'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import Loader from '../../components/Loader/Loader'
import { formatRelativeDate } from '../../utils/compositions'
import { AgentChip, CompEmbed, StratEmbed } from './blocks'
import './Doc.css'

const COLORS = [
  [null, 'Normal'], ['#ffa043', 'Ambre'], ['#ff6170', 'Rouge'], ['#4cc9f0', 'Bleu'],
  ['#4ade80', 'Vert'], ['#b78cff', 'Violet'], ['#f2d45c', 'Jaune'], ['#8b95a3', 'Gris'],
]
const MARKS = [
  [null, 'Aucun'], ['#ffa04340', 'Ambre'], ['#ff617040', 'Rouge'], ['#4cc9f040', 'Bleu'], ['#4ade8040', 'Vert'], ['#f2d45c45', 'Jaune'],
]

function Ico({ d, size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
const I = {
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  ul: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  ol: 'M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 14.5c0-1 2-1 2 0s-2 2.5-2 3.5h2',
  task: 'M4 5h5v5H4zM5.5 7.5l1 1 2-2M13 7.5h7M4 14h5v5H4zM13 16.5h7',
  quote: 'M7 7h4v5H7l-1 4M14 7h4v5h-4l-1 4',
  hr: 'M4 12h16',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  color: 'M5 20h14M8 16l4-11 4 11M9.5 12h5',
  mark: 'M9 11 4 16v4h4l5-5M14 6l4 4M12 8l6-6 4 4-6 6',
  agent: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c1-4 4-6 8-6s7 2 8 6',
  strat: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  comp: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
}

// Texte JSON stable (clés triées), pour comparer deux contenus
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x))

/** Page du Playbook : texte mis en forme, façon Word. Rien ne s'enregistre tout seul. */
export default function Doc() {
  const { docId } = useParams()
  const navigate = useNavigate()
  const { docs, status, dirty, patchLocal, saveDoc, revertDoc, removeDoc } = useDocs()
  const { maps, status: dataStatus } = useData()
  const { isAdmin } = useAuth()
  const { pushToast } = useToast()
  const doc = docs[docId]
  const editable = isAdmin
  const isDirty = dirty.has(docId)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const realMaps = useMemo(() => maps.filter((m) => !m.free && m.minimap).sort((a, b) => a.name.localeCompare(b.name)), [maps])
  const map = maps.find((m) => m.uuid === doc?.mapUuid)

  // ---------- Éditeur ----------
  const emitted = useRef(doc?.content) // dernier contenu venu de l'éditeur (pour reconnaître un changement venu d'ailleurs)
  // À l'ouverture, l'éditeur remet parfois le contenu « en forme » (tableaux, ordre des styles) : ce n'est pas
  // une modification. Seuls les changements faits après une action de la personne (clavier, souris) comptent.
  const touched = useRef(false)
  const baseline = useRef(null)
  const dirtyNow = useRef(false)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      LinkExt.configure({ openOnClick: !editable, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder: editable ? 'Écris ici… (titres, listes, agents, strats : tout est dans la barre au-dessus)' : '' }),
      AgentChip,
      StratEmbed,
      CompEmbed,
    ],
    content: doc?.content,
    editable,
    onCreate: ({ editor: ed }) => {
      touched.current = false
      baseline.current = canon(ed.getJSON())
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON()
      const c = canon(json)
      if (!touched.current) {
        baseline.current = c
        return
      }
      if (c === baseline.current && !dirtyNow.current) return
      emitted.current = json
      patchLocal(docId, { content: json })
    },
  }, [docId, Boolean(doc)])

  // Changement venu d'ailleurs (« Partir sans enregistrer », mise à jour en direct d'un coéquipier).
  // La base renvoie le même contenu avec les clés dans un autre ordre : on compare le fond, pas la forme,
  // pour ne pas remettre le curseur au début après un enregistrement.
  useEffect(() => {
    if (!editor || !doc || doc.content === emitted.current) return
    emitted.current = doc.content
    if (canon(doc.content) !== canon(editor.getJSON())) {
      editor.commands.setContent(doc.content, false)
      baseline.current = canon(editor.getJSON())
    }
  }, [editor, doc])
  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

  // ---------- Enregistrement (manuel) ----------
  const leavingRef = useRef(false)
  const allowRef = useRef(null)
  const doSave = useCallback(async () => {
    if (!doc || saving) return false
    setSaving(true)
    const content = editor ? editor.getJSON() : doc.content
    const id = await saveDoc(docId, { ...doc, content })
    if (id) baseline.current = canon(content)
    setSaving(false)
    if (!id) return false
    pushToast(id !== docId ? 'Page créée et enregistrée.' : 'Page enregistrée.', 'success')
    if (id !== docId && !leavingRef.current) {
      allowRef.current?.()
      navigate(`/playbook/${id}`, { replace: true })
    }
    return true
  }, [doc, saving, editor, saveDoc, docId, pushToast, navigate])

  const { allow, dialog: leaveDialog } = useUnsavedGuard({
    when: isDirty,
    label: doc?.title,
    onSave: async () => {
      leavingRef.current = true
      const ok = await doSave()
      leavingRef.current = false
      return ok
    },
    onDiscard: () => revertDoc(docId),
  })
  useEffect(() => {
    allowRef.current = allow
  }, [allow])
  useEffect(() => {
    dirtyNow.current = isDirty
  }, [isDirty])
  useEffect(() => () => {
    if (dirtyNow.current) revertDoc(docId)
  }, [docId, revertDoc])

  useEffect(() => {
    if (!editable) return undefined
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        doSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable, doSave])

  const doDelete = async () => {
    setConfirmDelete(false)
    if (await removeDoc(docId)) {
      allow()
      pushToast('Page supprimée.', 'success')
      navigate('/playbook')
    }
  }

  if (status === 'loading' || dataStatus === 'loading') {
    return <main className="container"><Loader label="Chargement de la page…" /></main>
  }
  if (!doc) {
    return (
      <main className="container pb-missing">
        <h2>Page introuvable</h2>
        <p>Elle a peut-être été supprimée.</p>
        <Link to="/playbook" className="btn btn-primary">Tout le playbook</Link>
      </main>
    )
  }

  return (
    <main className={`pbd container${editable ? '' : ' pbd--ro'}`}>
      <div className="pbd__top">
        <Link to="/playbook" className="pbd__back">← Playbook</Link>
        <div className="pbd__actions">
          <button type="button" className="pbd__btn" onClick={() => window.print()} title="Imprimer ou enregistrer en PDF">
            <Ico d={I.print} /> <span>Imprimer / PDF</span>
          </button>
          {editable && (
            <button type="button" className="pbd__btn pbd__btn--danger" onClick={() => setConfirmDelete(true)} title="Supprimer la page">
              <Ico d={I.trash} /> <span>Supprimer</span>
            </button>
          )}
          {editable && (
            <button type="button" className={`pbd__save${isDirty ? ' dirty' : ''}`} onClick={doSave} disabled={!isDirty || saving} title="Ctrl+S">
              <i aria-hidden="true" />
              {saving ? 'Enregistrement…' : isDirty ? 'Enregistrer' : 'Enregistré'}
            </button>
          )}
        </div>
      </div>

      <div className="pbd__head">
        {editable ? (
          <input className="pbd__title" value={doc.title} maxLength={80} placeholder="Titre de la page" aria-label="Titre de la page"
            onChange={(e) => patchLocal(docId, { title: e.target.value })} />
        ) : (
          <h1 className="pbd__title">{doc.title}</h1>
        )}
        <div className="pbd__meta">
          {editable ? (
            <label className="pbd__map">
              <span>Rangée dans</span>
              <select value={doc.mapUuid || ''} onChange={(e) => patchLocal(docId, { mapUuid: e.target.value || null })} aria-label="Map de la page">
                <option value="">Général</option>
                {realMaps.map((m) => <option key={m.uuid} value={m.uuid}>{m.name}</option>)}
              </select>
            </label>
          ) : (
            <span className="pbd__chip">{map ? map.name : 'Général'}</span>
          )}
          {!doc.draft && <span className="pbd__date">Modifiée {formatRelativeDate(doc.updatedAt)}</span>}
          {doc.draft && <span className="pbd__date pbd__date--new">Nouvelle page : enregistre-la pour la garder</span>}
        </div>
      </div>

      <div className="pbd__work" onPointerDownCapture={() => { touched.current = true }} onKeyDownCapture={() => { touched.current = true }}
        onPasteCapture={() => { touched.current = true }} onDropCapture={() => { touched.current = true }}>
      {editable && editor && <Toolbar editor={editor} mapUuid={doc.mapUuid} />}

      <article className="pbd__paper">
        <EditorContent editor={editor} className="pb-content" />
      </article>
      </div>

      {leaveDialog}
      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette page ?"
        description={`« ${doc.title} » sera supprimée du playbook pour toute l'équipe.`}
        confirmLabel="Supprimer"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  )
}

// ---------- Barre d'outils ----------
// Bouton de la barre : ne prend pas le focus (la sélection du texte reste en place)
function B({ on, label, onClick, children, disabled, isOpen }) {
  return (
    <button type="button" className={`pbt__b${on ? ' on' : ''}${isOpen ? ' open' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      title={label} aria-label={label} aria-pressed={on || undefined} disabled={disabled}>{children}</button>
  )
}

function Toolbar({ editor, mapUuid }) {
  const [open, setOpen] = useState(null) // menu ouvert : 'color' | 'mark' | 'link' | 'agent' | 'strat' | 'comp'
  const barRef = useRef(null)
  const closeMenu = useCallback(() => setOpen(null), [])
  useClickOutside(barRef, Boolean(open), closeMenu)
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const ch = () => editor.chain().focus()
  const block = editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
  const setBlock = (v) => {
    if (v === 'p') ch().setParagraph().run()
    else ch().setHeading({ level: Number(v[1]) }).run()
  }
  const inTable = editor.isActive('table')
  const curColor = editor.getAttributes('textStyle').color || null

  return (
    <div className="pbt" ref={barRef} role="toolbar" aria-label="Mise en forme">
      <div className="pbt__g">
        <B label="Annuler (Ctrl+Z)" onClick={() => ch().undo().run()} disabled={!editor.can().undo()}><Ico d={I.undo} /></B>
        <B label="Rétablir (Ctrl+Y)" onClick={() => ch().redo().run()} disabled={!editor.can().redo()}><Ico d={I.redo} /></B>
      </div>
      <div className="pbt__g">
        <select className="pbt__sel" value={block} onChange={(e) => setBlock(e.target.value)} aria-label="Style du paragraphe">
          <option value="p">Texte</option>
          <option value="h1">Titre 1</option>
          <option value="h2">Titre 2</option>
          <option value="h3">Titre 3</option>
        </select>
      </div>
      <div className="pbt__g">
        <B label="Gras (Ctrl+B)" on={editor.isActive('bold')} onClick={() => ch().toggleBold().run()}><b>G</b></B>
        <B label="Italique (Ctrl+I)" on={editor.isActive('italic')} onClick={() => ch().toggleItalic().run()}><i>I</i></B>
        <B label="Souligné (Ctrl+U)" on={editor.isActive('underline')} onClick={() => ch().toggleUnderline().run()}><u>S</u></B>
        <B label="Barré" on={editor.isActive('strike')} onClick={() => ch().toggleStrike().run()}><s>ab</s></B>
        <span className="pbt__pop">
          <B label="Couleur du texte" isOpen={open === 'color'} onClick={() => toggle('color')}><span className="pbt__color" style={{ '--c': curColor || 'currentColor' }}><Ico d={I.color} /></span></B>
          {open === 'color' && (
            <div className="pbt__menu pbt__swatches" role="menu">
              {COLORS.map(([c, n]) => (
                <button key={n} type="button" className="pbt__sw" style={{ '--c': c || '#eef0f3' }} title={n} aria-label={n} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (c) ch().setColor(c).run(); else ch().unsetColor().run(); setOpen(null) }} />
              ))}
            </div>
          )}
        </span>
        <span className="pbt__pop">
          <B label="Surligner" isOpen={open === 'mark'} on={editor.isActive('highlight')} onClick={() => toggle('mark')}><Ico d={I.mark} /></B>
          {open === 'mark' && (
            <div className="pbt__menu pbt__swatches" role="menu">
              {MARKS.map(([c, n]) => (
                <button key={n} type="button" className={`pbt__sw${c ? '' : ' pbt__sw--none'}`} style={{ '--c': c || 'transparent' }} title={n} aria-label={n} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (c) ch().setHighlight({ color: c }).run(); else ch().unsetHighlight().run(); setOpen(null) }} />
              ))}
            </div>
          )}
        </span>
      </div>
      <div className="pbt__g">
        <B label="Liste à puces" on={editor.isActive('bulletList')} onClick={() => ch().toggleBulletList().run()}><Ico d={I.ul} /></B>
        <B label="Liste numérotée" on={editor.isActive('orderedList')} onClick={() => ch().toggleOrderedList().run()}><Ico d={I.ol} /></B>
        <B label="Cases à cocher" on={editor.isActive('taskList')} onClick={() => ch().toggleTaskList().run()}><Ico d={I.task} /></B>
        <B label="Citation / encadré" on={editor.isActive('blockquote')} onClick={() => ch().toggleBlockquote().run()}><Ico d={I.quote} /></B>
        <B label="Séparateur" onClick={() => ch().setHorizontalRule().run()}><Ico d={I.hr} /></B>
        <B label="Tableau" on={inTable} onClick={() => ch().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} disabled={inTable}><Ico d={I.table} /></B>
        <span className="pbt__pop">
          <B label="Lien" isOpen={open === 'link'} on={editor.isActive('link')} onClick={() => toggle('link')}><Ico d={I.link} /></B>
          {open === 'link' && <LinkMenu editor={editor} onDone={() => setOpen(null)} />}
        </span>
      </div>
      <div className="pbt__g pbt__g--insert">
        <span className="pbt__label">Insérer</span>
        <span className="pbt__pop">
          <B label="Insérer un agent dans le texte" isOpen={open === 'agent'} onClick={() => toggle('agent')}><Ico d={I.agent} /><span className="pbt__txt">Agent</span></B>
          {open === 'agent' && <AgentMenu editor={editor} onDone={() => setOpen(null)} />}
        </span>
        <span className="pbt__pop">
          <B label="Insérer une strat" isOpen={open === 'strat'} onClick={() => toggle('strat')}><Ico d={I.strat} /><span className="pbt__txt">Strat</span></B>
          {open === 'strat' && <StratMenu editor={editor} mapUuid={mapUuid} onDone={() => setOpen(null)} />}
        </span>
        <span className="pbt__pop">
          <B label="Insérer une compo" isOpen={open === 'comp'} onClick={() => toggle('comp')}><Ico d={I.comp} /><span className="pbt__txt">Compo</span></B>
          {open === 'comp' && <CompMenu editor={editor} mapUuid={mapUuid} onDone={() => setOpen(null)} />}
        </span>
      </div>
      {inTable && (
        <div className="pbt__g pbt__g--table">
          <span className="pbt__label">Tableau</span>
          <button type="button" className="pbt__tb" onMouseDown={(e) => e.preventDefault()} onClick={() => ch().addRowAfter().run()}>+ Ligne</button>
          <button type="button" className="pbt__tb" onMouseDown={(e) => e.preventDefault()} onClick={() => ch().addColumnAfter().run()}>+ Colonne</button>
          <button type="button" className="pbt__tb" onMouseDown={(e) => e.preventDefault()} onClick={() => ch().deleteRow().run()}>− Ligne</button>
          <button type="button" className="pbt__tb" onMouseDown={(e) => e.preventDefault()} onClick={() => ch().deleteColumn().run()}>− Colonne</button>
          <button type="button" className="pbt__tb pbt__tb--danger" onMouseDown={(e) => e.preventDefault()} onClick={() => ch().deleteTable().run()}>Supprimer le tableau</button>
        </div>
      )}
    </div>
  )
}

function LinkMenu({ editor, onDone }) {
  const [url, setUrl] = useState(editor.getAttributes('link').href || '')
  const apply = (e) => {
    e.preventDefault()
    const v = url.trim()
    if (!v) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const href = /^(https?:|mailto:|#)/i.test(v) ? v : `https://${v}`
      if (editor.state.selection.empty && !editor.isActive('link')) editor.chain().focus().insertContent({ type: 'text', text: v, marks: [{ type: 'link', attrs: { href } }] }).run()
      else editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    onDone()
  }
  return (
    <form className="pbt__menu pbt__linkform" onSubmit={apply}>
      <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (vide = retirer le lien)" aria-label="Adresse du lien" />
      <button type="submit" className="btn btn-primary">OK</button>
    </form>
  )
}

function AgentMenu({ editor, onDone }) {
  const { agents } = useData()
  const [q, setQ] = useState('')
  const list = agents.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  const pick = (a) => {
    editor.chain().focus().insertContent([{ type: 'agentChip', attrs: { uuid: a.uuid } }, { type: 'text', text: ' ' }]).run()
    onDone()
  }
  return (
    <div className="pbt__menu pbt__list pbt__list--agents">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un agent" aria-label="Chercher un agent"
        onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); pick(list[0]) } }} />
      <div className="pbt__agents">
        {list.map((a) => (
          <button key={a.uuid} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a)} title={a.name}>
            <img src={a.icon} alt="" /><span>{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function StratMenu({ editor, mapUuid, onDone }) {
  const { strats } = useStrats()
  const { maps } = useData()
  const mapName = (u) => maps.find((m) => m.uuid === u)?.name || 'Map'
  const list = Object.values(strats).filter((s) => !s.draft)
    .sort((a, b) => (a.mapUuid === mapUuid) === (b.mapUuid === mapUuid) ? mapName(a.mapUuid).localeCompare(mapName(b.mapUuid)) || a.name.localeCompare(b.name) : a.mapUuid === mapUuid ? -1 : 1)
  const pick = (s) => {
    editor.chain().focus().insertContent([{ type: 'stratEmbed', attrs: { id: s.id } }, { type: 'paragraph' }]).run()
    onDone()
  }
  return (
    <div className="pbt__menu pbt__list">
      {list.length === 0 && <p className="pbt__empty">Aucune strat pour l’instant. Crée-en une dans l’onglet Strats.</p>}
      {list.map((s) => (
        <button key={s.id} type="button" className="pbt__row" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
          <b>{s.name}</b><small className={s.side}>{mapName(s.mapUuid)} · {s.side === 'defense' ? 'Défense' : 'Attaque'}</small>
        </button>
      ))}
    </div>
  )
}

function CompMenu({ editor, mapUuid, onDone }) {
  const { compositionsByMap } = useCompositions()
  const { maps } = useData()
  const mapName = (u) => maps.find((m) => m.uuid === u)?.name || 'Map'
  const list = Object.entries(compositionsByMap).flatMap(([m, bucket]) => Object.values(bucket || {}).map((c) => ({ ...c, mapUuid: m })))
    .filter((c) => maps.some((m) => m.uuid === c.mapUuid))
    .sort((a, b) => (a.mapUuid === mapUuid) === (b.mapUuid === mapUuid) ? mapName(a.mapUuid).localeCompare(mapName(b.mapUuid)) || a.name.localeCompare(b.name) : a.mapUuid === mapUuid ? -1 : 1)
  const pick = (c) => {
    editor.chain().focus().insertContent([{ type: 'compEmbed', attrs: { id: c.id, map: c.mapUuid } }, { type: 'paragraph' }]).run()
    onDone()
  }
  return (
    <div className="pbt__menu pbt__list">
      {list.length === 0 && <p className="pbt__empty">Aucune compo pour l’instant.</p>}
      {list.map((c) => (
        <button key={c.id} type="button" className="pbt__row" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
          <b>{c.name}</b><small>{mapName(c.mapUuid)}{c.isMain ? ' · principale' : ''}</small>
        </button>
      ))}
    </div>
  )
}
