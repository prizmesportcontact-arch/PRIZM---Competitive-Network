// Le spike de Valorant, dessiné en vectoriel (repère centré, rayon ~1).
// Partagé entre le tableau (SVG) et l'export PNG (canvas, via Path2D).
export const SPIKE = {
  // Disque de fond
  r: 1.18,
  // Corps : cylindre effilé vers le bas, coiffé d'un capot
  body: 'M-0.46 -0.62 L-0.3 -0.86 L0.3 -0.86 L0.46 -0.62 L0.5 0.2 L0.16 0.86 L-0.16 0.86 L-0.5 0.2 Z',
  // Bandes latérales (les « ailettes » du spike)
  fins: 'M-0.5 -0.36 L-0.78 -0.5 L-0.78 0.06 L-0.5 0.12 Z M0.5 -0.36 L0.78 -0.5 L0.78 0.06 L0.5 0.12 Z',
  // Cœur lumineux
  core: 'M-0.15 -0.58 L0.15 -0.58 L0.15 0.24 L0 0.52 L-0.15 0.24 Z',
  // Capot (trait clair en haut)
  cap: 'M-0.3 -0.86 L0.3 -0.86 L0.24 -0.72 L-0.24 -0.72 Z',
  red: '#ff4655',
  dark: '#23272e',
  bg: '#140a0d',
}
