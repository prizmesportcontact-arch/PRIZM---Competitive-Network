# PRIZM Competitive Network : mise en ligne

Le site se compose de quelques fichiers (`index.html`, `styles.css`, `app.js`, `config.js`, `logo.png`), du dossier `compo/` (le Comp Builder, déjà construit) et des scripts de base de données du dossier `supabase/`. Tout se fait dans le navigateur, rien à installer.

Compte 15 minutes au total.

## 1. Créer la base de données (Supabase)

1. Ouvre ton projet **PRZM CN - Website** sur supabase.com.
2. Menu de gauche : **SQL Editor**, puis **New query**.
3. Colle tout le contenu de `supabase/001_comptes_equipes.sql` et clique sur **Run**.
4. Tu dois voir « Success. No rows returned ».

## 2. Créer l'application Discord (pour le bouton « Connexion »)

1. Va sur https://discord.com/developers/applications et clique sur **New Application**. Nomme-la `PRIZM Competitive Network`.
2. Onglet **OAuth2** :
   - Copie le **Client ID**.
   - Clique sur **Reset Secret** et copie le **Client Secret**. Ne le partage avec personne.
   - Dans **Redirects**, ajoute exactement cette adresse :
     `https://cbbnrdfvaaikawszaysu.supabase.co/auth/v1/callback`
   - Clique sur **Save Changes**.
3. Optionnel : dans **General Information**, mets le logo PRIZM comme icône. C'est ce que les joueurs verront au moment de se connecter.

## 3. Relier Discord à Supabase

1. Dans Supabase : **Authentication**, puis **Sign In / Providers**, puis **Discord**.
2. Active **Enable Sign in with Discord**.
3. Colle le **Client ID** et le **Client Secret** de l'étape 2, puis clique sur **Save**.

## 4. Mettre le site en ligne (GitHub Pages)

1. Sur GitHub, crée un nouveau dépôt **public**, par exemple `prizm-network`.
2. Clique sur **Add file**, puis **Upload files**, et glisse tous les fichiers du dossier (le dossier `supabase` compris). Clique sur **Commit changes**.
3. **Settings**, puis **Pages** : choisis la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Au bout d'une minute, le site est en ligne à l'adresse `https://TON-PSEUDO.github.io/prizm-network/`.

## 5. Autoriser l'adresse du site dans Supabase

1. Dans Supabase : **Authentication**, puis **URL Configuration**.
2. **Site URL** : colle l'adresse du site (étape 4).
3. **Redirect URLs** : clique sur **Add URL** et colle la même adresse.

## 6. Te donner les droits admin

1. Connecte-toi une fois sur le site avec Discord.
2. Dans Supabase, **SQL Editor**, lance cette ligne en remplaçant le pseudo par ton pseudo Discord :

```sql
update public.profiles set is_admin = true where username = 'TonPseudoDiscord';
```

3. Recharge le site : **Admin** apparaît dans le menu sous ton avatar.

## 7. Ajouter les liens Discord, Twitch et YouTube

Dans `config.js` sur GitHub (icône crayon pour modifier), remplis `discord`, `twitch` et `youtube`, puis **Commit changes**. Les boutons grisés deviennent actifs.

## Ce que le site sait faire

- **Connexion avec Discord** : le profil est créé automatiquement (pseudo et avatar Discord).
- **Profil** : Riot ID et rang actuel, avec la division correspondante.
- **Équipe** : création (le créateur devient capitaine), code et lien d'invitation, 7 joueurs max (5 titulaires et 2 remplaçants). Le capitaine peut changer les rôles, nommer un autre capitaine ou retirer un joueur.
- **Division estimée** : moyenne des rangs des titulaires. L'équipe monte d'une division si un joueur est 2 divisions au-dessus du reste.
- **Admin** : liste des équipes, validation avec choix de la division, ou refus.
- **Équipes** : page publique des équipes validées, classées par division.

## Espace équipe et Comp Builder

- **Espace équipe** (`#/espace`, menu « Mon espace ») : tableau de bord privé de l'équipe. Ce qui demande une action (résultat de scrim à envoyer, validation…), prochains scrims, classement, état des compos et roster.
- **Comp Builder** (dossier `compo/`) : la préparation des compos, map par map (agents, joueurs, statut, notes). Chaque équipe a le sien, visible seulement par ses membres, avec la même connexion Discord que le site. Les joueurs qui rejoignent l'équipe y apparaissent tout seuls.
  - Le **capitaine** peut tout modifier et nomme des **éditeurs** (étoile sur la page Équipe du Comp Builder). Les autres joueurs consultent et règlent leurs propres rôles.
  - Scrims, classement et stats restent sur le site : le Comp Builder ne fait que les compos.
- Code source du Comp Builder : dépôt `FroseFox/CompoBuilder`. Après une modification : `npm run build`, puis remplacer le dossier `compo/` par le contenu de `dist/`.

## Actualisation automatique

Le site se met à jour tout seul (équipes, scrims, classement, recherche, espace équipe) grâce à la table `live_pulse` : chaque changement en base envoie juste « ce sujet a bougé », et la page ouverte se recharge. Si tu es en train d'écrire dans un formulaire, rien n'est effacé : une pastille « Du nouveau · actualiser » apparaît à la place. Pour rester dans le quota gratuit de Supabase, la connexion temps réel se coupe quand l'onglet reste caché plus de 2 minutes et rattrape les nouveautés au retour.

Scripts SQL de cette version : `supabase/013_…`, `014_…` et `016_comp_builder_simplifie.sql` (déjà appliqués sur le projet, gardés pour l'historique ; le 016 retire matchs, dispos et Discord du Comp Builder).
