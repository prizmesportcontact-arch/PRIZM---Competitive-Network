// ============================================================
// Playbook : pages de texte mis en forme de l'équipe (table cb_docs).
//
// Une page = un titre, une map (ou « Général » si mapUuid est null)
// et un contenu Tiptap (JSON). Les strats, compos et agents insérés
// ne sont que des références : le texte reste léger.
// ============================================================

import { supabase } from './supabaseClient'
import { getTeamId } from './team'

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

export function rowToDoc(row) {
  return {
    id: row.id,
    mapUuid: row.map_uuid,
    title: row.title,
    content: row.content && row.content.type === 'doc' ? row.content : EMPTY_DOC,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

export async function fetchDocs() {
  const { data, error } = await supabase
    .from('cb_docs')
    .select('*')
    .eq('team_id', getTeamId())
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map(rowToDoc)
}

export async function insertDoc({ mapUuid = null, title, content }) {
  const { data, error } = await supabase
    .from('cb_docs')
    .insert({ team_id: getTeamId(), map_uuid: mapUuid, title, content: content || EMPTY_DOC })
    .select()
    .single()
  if (error) throw error
  return rowToDoc(data)
}

export async function updateDocRow(id, patch) {
  const dbPatch = {}
  if ('title' in patch) dbPatch.title = patch.title
  if ('content' in patch) dbPatch.content = patch.content
  if ('mapUuid' in patch) dbPatch.map_uuid = patch.mapUuid
  const { data, error } = await supabase.from('cb_docs').update(dbPatch).eq('id', id).select().single()
  if (error) throw error
  return rowToDoc(data)
}

export async function deleteDocRow(id) {
  const { error } = await supabase.from('cb_docs').delete().eq('id', id)
  if (error) throw error
}
