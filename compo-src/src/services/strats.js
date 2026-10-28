// ============================================================
// Tableau tactique : accès aux strats de l'équipe (table cb_strats).
//
// Une strat = une map, un côté, et plusieurs étapes (Setup, Exécution,
// Post-plant…). Chaque étape contient des éléments posés sur la minimap,
// avec des coordonnées entières de 0 à 1000 :
//   { id, t: 'agent',   a: agentUuid, x, y }
//   { id, t: 'ability', a: agentUuid, s: slot, x, y }
//   { id, t: 'spike',   x, y }
//   { id, t: 'line',    p: [x1, y1, x2, y2], c, ar: true|false }
//   { id, t: 'draw',    p: [x, y, x, y, ...], c }
//   { id, t: 'zone',    x, y, r, c }
//   { id, t: 'text',    x, y, v, c }
// ============================================================

import { supabase } from './supabaseClient'
import { getTeamId } from './team'

export const STEP_NAMES = ['Setup', 'Exécution', 'Post-plant', 'Retake']

export const uid = () => Math.random().toString(36).slice(2, 10)

export function newStep(name = 'Setup', items = []) {
  return { id: uid(), name, items }
}

export function rowToStrat(row) {
  return {
    id: row.id,
    mapUuid: row.map_uuid,
    compositionId: row.composition_id,
    name: row.name,
    side: row.side,
    flipped: row.flipped,
    steps: Array.isArray(row.steps) && row.steps.length ? row.steps : [newStep()],
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

export async function fetchStrats() {
  const { data, error } = await supabase
    .from('cb_strats')
    .select('*')
    .eq('team_id', getTeamId())
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map(rowToStrat)
}

export async function insertStrat({ mapUuid, compositionId = null, name, side = 'attaque', steps }) {
  const { data, error } = await supabase
    .from('cb_strats')
    .insert({
      team_id: getTeamId(),
      map_uuid: mapUuid,
      composition_id: compositionId,
      name,
      side,
      steps: steps || [newStep()],
    })
    .select()
    .single()
  if (error) throw error
  return rowToStrat(data)
}

export async function updateStratRow(id, patch) {
  const dbPatch = {}
  if ('name' in patch) dbPatch.name = patch.name
  if ('side' in patch) dbPatch.side = patch.side
  if ('flipped' in patch) dbPatch.flipped = patch.flipped
  if ('steps' in patch) dbPatch.steps = patch.steps
  if ('compositionId' in patch) dbPatch.composition_id = patch.compositionId
  if ('mapUuid' in patch) dbPatch.map_uuid = patch.mapUuid
  const { data, error } = await supabase.from('cb_strats').update(dbPatch).eq('id', id).select().single()
  if (error) throw error
  return rowToStrat(data)
}

export async function deleteStratRow(id) {
  const { error } = await supabase.from('cb_strats').delete().eq('id', id)
  if (error) throw error
}

/** Supprime toutes les strats de l'équipe (réinitialisation complète). */
export async function deleteAllStrats() {
  const { error } = await supabase.from('cb_strats').delete().eq('team_id', getTeamId())
  if (error) throw error
}
