// Éléments propres au Playbook, insérés dans le texte :
//  - agentChip   : icône + nom d'un agent, dans la ligne (« [Sova] flèche B main »)
//  - stratEmbed  : carte d'une strat (aperçu de la minimap), cliquable
//  - compEmbed   : carte d'une compo (les 5 agents), cliquable
// Seuls les identifiants sont enregistrés : la carte se met à jour si la strat ou la compo change.

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { useData } from '../../context/DataContext'
import { useStrats } from '../../context/StratsContext'
import { useCompositions } from '../../context/CompositionsContext'
import { StratPreview } from '../../components/StratList/StratList'

// ---------- Agent dans la ligne ----------
function AgentChipView({ node, selected }) {
  const { agents } = useData()
  const a = agents.find((x) => x.uuid === node.attrs.uuid)
  return (
    <NodeViewWrapper as="span" className={`pb-agent${selected ? ' is-sel' : ''}`} data-agent={node.attrs.uuid}>
      {a?.icon && <img src={a.icon} alt="" draggable="false" />}
      <span>{a?.name || 'Agent'}</span>
    </NodeViewWrapper>
  )
}

export const AgentChip = Node.create({
  name: 'agentChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { uuid: { default: null, parseHTML: (el) => el.getAttribute('data-agent'), renderHTML: (a) => ({ 'data-agent': a.uuid }) } }
  },
  parseHTML() {
    return [{ tag: 'span[data-agent]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'pb-agent' })]
  },
  renderText() {
    return '[agent]'
  },
  addNodeView() {
    return ReactNodeViewRenderer(AgentChipView)
  },
})

// ---------- Carte de strat ----------
function StratEmbedView({ node, selected }) {
  const { strats } = useStrats()
  const { maps, agents } = useData()
  const s = strats[node.attrs.id]
  const map = maps.find((m) => m.uuid === s?.mapUuid)
  const agentByUuid = useMemo(() => new Map(agents.map((a) => [a.uuid, a])), [agents])
  return (
    <NodeViewWrapper className={`pb-embed${selected ? ' is-sel' : ''}`} data-drag-handle="">
      {s ? (
        <Link to={`/strat/${s.id}`} className="pb-embed__card" contentEditable={false} draggable="false">
          <span className="pb-embed__thumb">
            <StratPreview map={map} strat={s} items={s.steps[0]?.items || []} agentByUuid={agentByUuid} />
          </span>
          <span className="pb-embed__body">
            <small className={`pb-embed__tag ${s.side}`}>Strat · {s.side === 'defense' ? 'Défense' : 'Attaque'}</small>
            <b>{s.name}</b>
            <span>{map?.name || 'Map'} · {s.steps.length} étape{s.steps.length > 1 ? 's' : ''}</span>
            <em>Ouvrir la strat →</em>
          </span>
        </Link>
      ) : (
        <div className="pb-embed__card pb-embed__card--gone" contentEditable={false}>Strat supprimée ou introuvable.</div>
      )}
    </NodeViewWrapper>
  )
}

export const StratEmbed = Node.create({
  name: 'stratEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null, parseHTML: (el) => el.getAttribute('data-strat'), renderHTML: (a) => ({ 'data-strat': a.id }) } }
  },
  parseHTML() {
    return [{ tag: 'div[data-strat]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)]
  },
  addNodeView() {
    return ReactNodeViewRenderer(StratEmbedView)
  },
})

// ---------- Carte de compo ----------
function CompEmbedView({ node, selected }) {
  const { compositionsByMap } = useCompositions()
  const { maps, agents } = useData()
  const { id, map: mapUuid } = node.attrs
  const comp = compositionsByMap[mapUuid]?.[id]
  const map = maps.find((m) => m.uuid === mapUuid)
  const agentByUuid = useMemo(() => new Map(agents.map((a) => [a.uuid, a])), [agents])
  return (
    <NodeViewWrapper className={`pb-embed${selected ? ' is-sel' : ''}`} data-drag-handle="">
      {comp ? (
        <Link to={`/editor/${mapUuid}`} className="pb-embed__card pb-embed__card--comp" contentEditable={false} draggable="false"
          style={map?.thumbnail ? { '--img': `url('${map.thumbnail}')` } : undefined}>
          <span className="pb-embed__body">
            <small className="pb-embed__tag">Compo · {map?.name || 'Map'}</small>
            <b>{comp.name}</b>
            <span className="pb-embed__agents">
              {comp.slots.map((sl, i) => {
                const a = agentByUuid.get(sl.agentUuid)
                return a ? <img key={i} src={a.icon} alt={a.name} title={a.name} /> : <i key={i} />
              })}
            </span>
            <em>Ouvrir la compo →</em>
          </span>
        </Link>
      ) : (
        <div className="pb-embed__card pb-embed__card--gone" contentEditable={false}>Compo supprimée ou introuvable.</div>
      )}
    </NodeViewWrapper>
  )
}

export const CompEmbed = Node.create({
  name: 'compEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-comp'), renderHTML: (a) => ({ 'data-comp': a.id }) },
      map: { default: null, parseHTML: (el) => el.getAttribute('data-map'), renderHTML: (a) => ({ 'data-map': a.map }) },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-comp]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CompEmbedView)
  },
})
