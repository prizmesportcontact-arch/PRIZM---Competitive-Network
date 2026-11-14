// Modèles de pages du Playbook, pour ne pas partir d'une page blanche.
// Les lignes en italique sont des exemples à remplacer.

const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const ex = (text) => t(text, [{ type: 'italic' }, { type: 'textStyle', attrs: { color: '#8b95a3' } }])
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const p = (...parts) => ({ type: 'paragraph', content: parts.length ? parts.map((x) => (typeof x === 'string' ? t(x) : x)) : undefined })
const ul = (...items) => ({ type: 'bulletList', content: items.map((x) => ({ type: 'listItem', content: [p(typeof x === 'string' ? ex(x) : x)] })) })
const tasks = (...items) => ({ type: 'taskList', content: items.map((x) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(ex(x))] })) })
const hr = { type: 'horizontalRule' }
const doc = (...content) => ({ type: 'doc', content })

export const TEMPLATES = [
  {
    id: 'vide',
    name: 'Page vide',
    desc: 'Tu écris ce que tu veux.',
    forMap: true,
    title: () => 'Nouvelle page',
    content: () => doc(p()),
  },
  {
    id: 'map',
    name: 'Plan de map',
    desc: 'Attaque, défense, anti-éco, points à travailler.',
    forMap: true,
    title: (mapName) => (mapName ? `Plan ${mapName}` : 'Plan de map'),
    content: () => doc(
      h(1, 'Attaque'),
      h(3, 'Default'),
      ul('Ex. : 4 A + 1 lurk B, info avant 1:15'),
      h(3, 'Exécutions'),
      ul('Site A : …', 'Site B : …'),
      h(3, 'Post-plant'),
      ul('Où se placer, qui garde le spike, quelle utilité garder'),
      hr,
      h(1, 'Défense'),
      h(3, 'Setup de base'),
      ul('Ex. : 2 A · 1 mid · 2 B'),
      h(3, 'Retakes'),
      ul('Site A : …', 'Site B : …'),
      hr,
      h(1, 'Anti-éco'),
      ul('Ex. : on joue groupé, pas de peek sec'),
      h(1, 'À travailler'),
      tasks('Ex. : timing de la flèche de Sova', 'Ex. : retake B sans utilité'),
    ),
  },
  {
    id: 'adversaire',
    name: 'Notes adversaire',
    desc: 'Avant un scrim ou un match : leurs habitudes et ton plan.',
    forMap: true,
    title: () => 'Adversaire : ',
    content: () => doc(
      p(t('Équipe : ', [{ type: 'bold' }]), ex('nom, rang moyen, date du match')),
      h(2, 'Leurs habitudes en attaque'),
      ul('Ex. : rush B au pistol, fakes A fréquents'),
      h(2, 'Leurs habitudes en défense'),
      ul('Ex. : stack A après 2 rounds perdus'),
      h(2, 'Joueurs à surveiller'),
      ul('Ex. : leur Jett ouvre toujours mid'),
      h(2, 'Notre plan'),
      ul('Ex. : on joue lent et on punit les push'),
      h(2, 'Après le match'),
      ul('Ce qui a marché, ce qu’on change la prochaine fois'),
    ),
  },
  {
    id: 'regles',
    name: 'Règles d’équipe',
    desc: 'Calls, économie, rôles : ce que tout le monde doit savoir.',
    forMap: false,
    title: () => 'Règles d’équipe',
    content: () => doc(
      h(2, 'Communication'),
      ul('Ex. : calls courts, un seul IGL en milieu de round', 'Ex. : on annonce les dégâts en chiffres'),
      h(2, 'Économie'),
      ul('Ex. : full save en dessous de 2 000 crédits', 'Ex. : on achète ensemble'),
      h(2, 'Rôles'),
      ul('IGL : …', 'Entry : …', 'Support : …'),
      h(2, 'Avant chaque scrim'),
      tasks('Échauffement 15 min', 'Relire le plan de la map'),
    ),
  },
]
