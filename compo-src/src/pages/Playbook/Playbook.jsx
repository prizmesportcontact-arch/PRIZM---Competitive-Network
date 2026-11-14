import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDocs } from '../../context/DocsContext'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import Loader from '../../components/Loader/Loader'
import { formatRelativeDate } from '../../utils/compositions'
import { TEMPLATES } from '../Doc/templates'
import './Playbook.css'

// Texte brut d'une page (aperçu et recherche)
function plain(node, out = []) {
  if (!node) return out
  if (node.type === 'text') out.push(node.text)
  if (node.type === 'agentChip') out.push('[agent]')
  ;(node.content || []).forEach((c) => plain(c, out))
  if (['paragraph', 'heading', 'listItem', 'taskItem'].includes(node.type)) out.push(' ')
  return out
}
const textOf = (doc) => plain(doc.content).join('').replace(/\s+/g, ' ').trim()

/** Playbook de l'équipe : pages de texte rangées par map (ou « Général »). */
export default function Playbook() {
  const { docs, status, createDraft } = useDocs()
  const { maps } = useData()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [mapPick, setMapPick] = useState('') // '' = Général
  const [q, setQ] = useState('')
  const realMaps = useMemo(() => maps.filter((m) => !m.free && m.minimap).sort((a, b) => a.name.localeCompare(b.name)), [maps])

  const list = useMemo(() => Object.values(docs).filter((d) => !d.draft).map((d) => ({ ...d, text: textOf(d) })), [docs])
  const needle = q.trim().toLowerCase()
  const shown = needle ? list.filter((d) => d.title.toLowerCase().includes(needle) || d.text.toLowerCase().includes(needle)) : list
  const groups = useMemo(() => {
    const g = [{ key: '', name: 'Général', map: null, docs: [] }]
    realMaps.forEach((m) => g.push({ key: m.uuid, name: m.name, map: m, docs: [] }))
    shown.forEach((d) => {
      const grp = g.find((x) => x.key === (d.mapUuid || '')) || g[0]
      grp.docs.push(d)
    })
    g.forEach((x) => x.docs.sort((a, b) => b.updatedAt - a.updatedAt))
    return g.filter((x) => x.docs.length)
  }, [shown, realMaps])

  const create = (tpl) => {
    const m = realMaps.find((x) => x.uuid === mapPick)
    const id = createDraft({ mapUuid: mapPick || null, title: tpl.title(m?.name), content: tpl.content() })
    navigate(`/playbook/${id}`)
  }

  return (
    <main className="pb container">
      <div className="pb__head">
        <div className="pb__head-row">
          <h1 className="pb__title">Playbook</h1>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
              + Nouvelle page
            </button>
          )}
        </div>
        <p>Les plans de l’équipe, rangés par map : defaults, exécutions, retakes, notes sur les adversaires, règles d’équipe. Insère tes strats et tes compos directement dans le texte.</p>
      </div>

      {creating && (
        <div className="pb__new" role="group" aria-label="Nouvelle page">
          <label className="pb__new-map">
            <span className="eyebrow">Rangée dans</span>
            <select value={mapPick} onChange={(e) => setMapPick(e.target.value)}>
              <option value="">Général (toute l’équipe)</option>
              {realMaps.map((m) => <option key={m.uuid} value={m.uuid}>{m.name}</option>)}
            </select>
          </label>
          <span className="eyebrow">Partir de</span>
          <div className="pb__tpls">
            {TEMPLATES.filter((tp) => tp.forMap || !mapPick).map((tp) => (
              <button key={tp.id} type="button" className="pb__tpl" onClick={() => create(tp)}>
                <b>{tp.name}</b>
                <small>{tp.desc}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {status === 'loading' ? (
        <Loader label="Chargement du playbook…" />
      ) : status === 'error' ? (
        <p className="pb__muted">Le playbook n’a pas pu être chargé. Recharge la page.</p>
      ) : list.length === 0 ? (
        <div className="pb__empty">
          <b>Aucune page pour l’instant.</b>
          <p>{isAdmin ? 'Clique sur « Nouvelle page » et pars d’un modèle : plan de map, notes adversaire ou règles d’équipe.' : 'Le capitaine et les éditeurs peuvent créer les premières pages.'}</p>
        </div>
      ) : (
        <>
          {list.length > 4 && (
            <input className="pb__search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans le playbook" aria-label="Chercher dans le playbook" />
          )}
          {groups.length === 0 && <p className="pb__muted">Rien ne correspond à « {q} ».</p>}
          {groups.map((g) => (
            <section key={g.key || 'general'} className="pb__group">
              <h2 className="pb__group-title">
                {g.name}
                <small>{g.docs.length} page{g.docs.length > 1 ? 's' : ''}</small>
              </h2>
              <div className="pb__grid">
                {g.docs.map((d) => (
                  <Link key={d.id} to={`/playbook/${d.id}`} className="pb__card" style={g.map?.thumbnail ? { '--img': `url('${g.map.thumbnail}')` } : undefined}>
                    <b>{d.title}</b>
                    <span>{d.text ? d.text.slice(0, 140) + (d.text.length > 140 ? '…' : '') : 'Page vide'}</span>
                    <small>Modifiée {formatRelativeDate(d.updatedAt)}</small>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  )
}
