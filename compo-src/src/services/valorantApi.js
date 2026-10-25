// ============================================================
// Service API — valorant-api.com
// API publique, gratuite, sans clé, communément utilisée pour
// des projets scolaires/personnels autour de Valorant.
// Toutes les données (maps, agents, rôles, images) sont
// récupérées dynamiquement : aucune donnée codée en dur ici.
// ============================================================

const BASE_URL = 'https://valorant-api.com/v1'
const LANG = 'fr-FR'

class ValorantApiError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'ValorantApiError'
    this.cause = cause
  }
}

async function request(path) {
  let response
  try {
    response = await fetch(`${BASE_URL}${path}`)
  } catch (err) {
    throw new ValorantApiError(
      "Impossible de contacter l'API Valorant. Vérifie ta connexion internet.",
      err
    )
  }

  if (!response.ok) {
    throw new ValorantApiError(
      `L'API Valorant a répondu avec une erreur (${response.status}).`
    )
  }

  const json = await response.json()

  if (json.status !== 200 || !json.data) {
    throw new ValorantApiError("Réponse inattendue de l'API Valorant.")
  }

  return json.data
}

/**
 * Rotation (0, 90, 180 ou 270°) qui place le spawn attaquant en bas de la carte.
 * Les positions viennent des « callouts » de l'API (coordonnées du jeu → minimap).
 */
function baseRotation(map) {
  const cs = map.callouts || []
  const uv = (c) => [c.location.y * map.xMultiplier + map.xScalarToAdd, c.location.x * map.yMultiplier + map.yScalarToAdd]
  const find = (re) => cs.find((c) => re.test(c.superRegionName || '') && /spawn/i.test(c.regionName || ''))
  const atk = find(/attacker/i)
  const def = find(/defender/i)
  if (!atk || !def || !map.xMultiplier) return 0
  const [ax, ay] = uv(atk)
  const [dx, dy] = uv(def)
  const angle = (Math.atan2(ay - dy, ax - dx) * 180) / Math.PI // direction défense → attaque
  return ((Math.round((90 - angle) / 90) * 90) % 360 + 360) % 360
}

/**
 * Récupère toutes les maps jouables en compétitif.
 * On filtre les entrées techniques (range d'entraînement, etc.)
 * en s'appuyant sur le champ `coordinates`, absent pour ces
 * pseudo-maps dans l'API — pas de liste codée en dur.
 */
export async function fetchMaps() {
  // En anglais : les noms des maps sont les mêmes, et les zones (« Attacker Side ») servent à orienter la carte
  const data = await request('/maps')
  const seen = new Set()
  return data
    // Maps à sites A/B(/C) uniquement : le stand d'entraînement, le tutoriel et
    // les maps de Deathmatch par équipe n'ont pas de description tactique.
    .filter((map) => Boolean(map.displayName) && Boolean(map.tacticalDescription))
    .filter((map) => !/range|tutorial|npe/i.test(map.mapUrl || ''))
    // Un même nom ne doit apparaître qu'une fois (variantes d'une map)
    .filter((map) => {
      const key = map.displayName.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((map) => ({
      uuid: map.uuid,
      name: map.displayName,
      image: map.splash || map.listViewIcon,
      thumbnail: map.listViewIcon || map.splash,
      minimap: map.displayIcon,
      // Échelle officielle (minimap par unité du jeu, 1 unité = 1 cm) : sert aux vraies tailles des capacités
      mult: map.xMultiplier || 0,
      rot: baseRotation(map),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Récupère tous les agents jouables, avec leur rôle et portraits.
 */
export async function fetchAgents() {
  const data = await request(
    `/agents?isPlayableCharacter=true&language=${LANG}`
  )
  return data
    .filter((agent) => Boolean(agent.role) && Boolean(agent.displayName))
    .map((agent) => ({
      uuid: agent.uuid,
      name: agent.displayName,
      portrait: agent.fullPortrait || agent.displayIcon,
      icon: agent.displayIcon,
      // Capacités (pour le tableau tactique) : C, Q, E, X — sans la passive
      abilities: (agent.abilities || [])
        .filter((ab) => ab.slot !== 'Passive' && ab.displayIcon)
        .map((ab) => ({ slot: ab.slot, name: ab.displayName, icon: ab.displayIcon })),
      role: {
        name: agent.role.displayName,
        icon: agent.role.displayIcon,
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export { ValorantApiError }
