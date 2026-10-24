# Comp Builder : code source

C'est ici qu'on modifie le Comp Builder. Le site sert la version construite, dans le dossier `../compo/`.

Rien à installer : à chaque modification de ce dossier poussée sur `main`, l'action GitHub
« Construire le Comp Builder » (`.github/workflows/compo.yml`) le reconstruit et remplace `compo/` toute seule.
Elle peut aussi être lancée à la main depuis l'onglet Actions.

- React 18 + Vite, routes par `#` (HashRouter).
- Même base Supabase que le site (`src/services/supabaseClient.js`) : la connexion Discord est partagée.
- Chaque équipe a son propre Comp Builder : tables `cb_*`, filtrées par équipe (règles RLS en base).
- Habillage du réseau : `src/styles/prizm.css` et l'en-tête `src/components/Navbar/`.
