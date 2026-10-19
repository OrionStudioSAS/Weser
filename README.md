# Weser — Veille des marchés

Espace commercial React pour repérer les appels d’offres concernant les appuis de fenêtre et les seuils de porte. Le client a confirmé que « les deux marchés » signifie **marchés publics et marchés privés**. Les marches d’escalier ne font pas partie du périmètre produit confirmé.

## Périmètre métier confirmé

- Produits : appuis de fenêtre et seuils de porte.
- Objectif : veille sur les appels d’offres publics **et privés**.
- Couverture effective actuelle : **commande publique uniquement**, avec BOAMP et TED. Ces deux sources ne constituent pas une veille générale des consultations privées. L’interface indique cette limite.
- Couverture privée : **non implémentée**. Identifier avec Weser les plateformes ou flux auxquels l’entreprise a accès, puis vérifier l’accès technique (API ou export autorisé) et les droits de réutilisation avant de développer le connecteur. Une saisie ou un import d’opportunités peut compléter la collecte, sans être présenté comme une veille automatique exhaustive.
- Le statut juridique de l’acheteur ne suffit pas à classer une consultation comme privée : conserver le contexte et la provenance de chaque opportunité.

## Lancement

Node.js 20.19 ou supérieur.

```sh
npm ci
npm run dev
```

Ouvrir http://localhost:5173. Sans configuration GitHub, le suivi et les recherches restent dans le stockage local du navigateur, ce qui est signalé dans l’interface. Les résultats proviennent des API publiques réelles ; aucune annonce de démonstration n’est injectée.

## GitHub : code et données

Le dossier est relié au dépôt `https://github.com/OrionStudioSAS/Weser.git`. Aucun push ni changement de visibilité du dépôt n’est effectué par l’application.

1. Créer un fichier `.env` à partir de `.env.example`.
2. Vérifier que le dépôt de données est **privé** et que la branche indiquée existe avec au moins un commit. Le code et les données peuvent être dans le même dépôt ; un dépôt distinct est également possible.
3. Créer un jeton GitHub à accès fin limité à ce dépôt avec **Contents: Read and write**. Renseigner `GITHUB_TOKEN` uniquement dans `.env` ou dans les secrets de l’hébergeur, jamais dans une variable `VITE_`.
4. Renseigner propriétaire, dépôt, branche et chemin du fichier JSON. Redémarrer le serveur, puis vérifier « Connexion & paramètres » dans l’application.

Le fichier de données est créé lors de la première sauvegarde. Le serveur vérifie la confidentialité du dépôt avant toute lecture ou écriture. Un SHA est transmis à GitHub pour empêcher l’écrasement d’une modification concurrente. En cas de conflit, l’utilisateur doit recharger la sauvegarde et réappliquer sa modification. Aucun basculement silencieux vers le stockage local n’a lieu en cas d’erreur GitHub.

Les sauvegardes sont de petits fichiers JSON versionnés : favoris, notes, statut, extrait de l’avis et critères de recherche. Une action de sauvegarde crée un commit. Limites de cette version : 300 opportunités, 30 recherches, fichier inférieur à 700 Ko ; une limite effective plus basse peut être atteinte selon la taille des notes. Les textes des avis sauvegardés sont limités à 1 200 caractères. GitHub n’est pas adapté à un volume élevé d’écritures simultanées. Supprimer une information du fichier courant ne la retire pas de l’historique Git. Les données du mode local ne sont pas migrées automatiquement vers GitHub.

## Hébergement

```sh
npm run build
npm start
```

L’application est servie par **Node/Express**, qui héberge à la fois le build React et les routes `/api`. GitHub héberge le dépôt de code et le fichier de données, pas le processus serveur. **GitHub Pages seul ne peut pas héberger cette architecture**, car le jeton doit rester côté serveur. Prévoir un hébergement Node avec HTTPS, les variables serveur et `HOST=0.0.0.0` si requis par l’hébergeur. Définir `APP_ORIGIN` avec l’origine publique exacte (ex. `https://admin.example.fr`) derrière un reverse proxy.

`ADMIN_PASSWORD` est obligatoire en production. L’accès à l’interface et aux API est protégé par HTTP Basic (`ADMIN_USER`, `ADMIN_PASSWORD`). C’est une protection partagée pour cette première version, sans comptes individuels ni gestion des rôles. Un raccordement à l’authentification du futur espace administrateur reste à prévoir lors de son intégration. Ne pas utiliser HTTP Basic sans HTTPS sur Internet.

Aucun déploiement distant ni configuration de secret n’est effectué par les scripts locaux.

## Déploiement Vercel

Le fichier `vercel.json` sélectionne le preset **Express** et la commande `npm run build`. Le point d’entrée `app.mjs` exporte l’application sans démarrer de serveur local ni importer Vite. Le build React `dist/**` est inclus dans la fonction et servi par `sendFile()` après authentification. Le répertoire statique public est volontairement vide ; ne pas y placer de données privées. Aucune réécriture vers `index.html` ne doit intercepter les routes `/api`.

Dans **Settings → Environment Variables**, renseigner pour **Production**, et également **Preview** si des aperçus doivent fonctionner :

| Variable | Valeur |
| --- | --- |
| `ADMIN_USER` | `weser` ou identifiant choisi |
| `ADMIN_PASSWORD` | Mot de passe long choisi pour l’accès administrateur (obligatoire) |
| `GITHUB_TOKEN` | Jeton privé limité au dépôt, permission Contents lecture/écriture |
| `GITHUB_OWNER` | `OrionStudioSAS` |
| `GITHUB_REPO` | `Weser` (dépôt privé) |
| `GITHUB_BRANCH` | `main` ou branche de données existante |
| `GITHUB_DATA_PATH` | `data/veille.json` |
| `APP_ORIGIN` | Optionnel : origine HTTPS exacte du domaine utilisé, sans `/` final |

Sans `APP_ORIGIN`, le serveur Vercel utilise l’origine HTTPS du domaine de la requête, ce qui convient aussi aux URL de preview. Si cette variable est fixée, les sauvegardes depuis une autre origine sont refusées. `PORT` et `HOST` ne doivent pas être ajoutés sur Vercel. Aucun préfixe `VITE_` pour ces variables. Ni BOAMP ni TED n’exigent de clé pour les recherches publiques utilisées ici.

Ajouter les variables dans Vercel ne modifie pas les déploiements existants : **redéployer après leur configuration et après avoir poussé le correctif**. Ne jamais copier les secrets dans le chat ou le dépôt Git.

Si le projet est déjà importé avec un ancien réglage Vite, vérifier les paramètres de build : le preset est Express, le build est `npm run build` et le répertoire statique est `public`, pas `dist`. La configuration suivie dans `vercel.json` fixe ces valeurs pour ce projet.

Vérification après redéploiement : ouvrir le site et s’authentifier, puis visiter `/api/config` : une réponse JSON avec `githubConfigured` et `protected` doit apparaître. L’absence de `ADMIN_PASSWORD` renvoie une erreur de configuration explicite et bloque l’accès. Une erreur de permissions GitHub est remontée comme telle, sans écriture de remplacement en local.

## Recherche et limites de couverture

- BOAMP : Explore v2.1, jeu `boamp`, avis de marché non annulés, date de publication et échéances. Les termes sont combinés avec `LIKE` pour éviter la recherche floue qui peut confondre « porte » avec « port ». Les résultats sont ensuite vérifiés dans le texte disponible.
- TED : Search API v3, avis `cn-standard` / `cn-social`, texte intégral, date de publication et pays acheteur France par défaut. Le filtre France correspond au pays de l’acheteur, pas nécessairement au lieu d’exécution. Le périmètre « Tous les pays TED » autorise l’ensemble du fonds, avec des expressions françaises : aucune traduction automatique n’est appliquée.
- Les mots-clés saisis remplacent la famille : l’expression normalisée est vérifiée dans le titre et le texte récupérés. Les recherches par famille reconnaissent quelques variantes, sans garantie d’exhaustivité.
- 50 candidats par source et par page, puis filtrage des mentions produit et des échéances. Les compteurs montrent les avis effectivement chargés après filtrage, pas l’ensemble des marchés existants. Une page peut être vide après filtrage alors que les suivantes contiennent des avis. La pagination est plafonnée à 100 pages ; affiner la période ou les mots-clés pour les recherches volumineuses.
- Les services de nettoyage peuvent mentionner les appuis de fenêtre ; ils sont signalés « À vérifier » plutôt que qualifiés automatiquement comme opportunités.
- Un avis sans échéance reste visible lorsque le filtre d’échéance est actif. Pour TED, on affiche la prochaine date future des lots, sinon la dernière connue. Consulter l’avis original pour les heures et les dates par lot.
- Les doublons sont fusionnés uniquement si les sources fournissent le même identifiant de procédure. La présence de deux publications n’est pas toujours détectable. Pas de rapprochement approximatif par titre.
- Les rectificatifs restent des publications ; cette version ne reconstitue pas l’historique complet d’une procédure.
- Les avis peuvent omettre les produits figurant uniquement dans les CCTP. **Les DCE/CCTP ne sont pas téléchargés ni analysés.** Les mentions explicites peuvent donc être rares ; aucun résultat ne signifie pas absence de chantier pertinent.
- La recherche se lance à l’ouverture puis à la demande. Pas de collecte en arrière-plan, d’alerte email ou de tâche planifiée dans cette version.

## Vérification

```sh
npm test
npm run build
```

Les tests couvrent la qualification des produits et faux positifs, la normalisation des avis, les paramètres des requêtes, la fusion sûre, la sauvegarde GitHub avec conflits et refus des dépôts publics, et la protection HTTP des routes serveur. GitHub est simulé dans les tests : aucune écriture distante n’est effectuée.

## Sources techniques

- [API BOAMP](https://www.boamp.fr/api-console/explore/v2.1/)
- [Syntaxe ODSQL](https://help.opendatasoft.com/apis/ods-explore-v2/)
- [TED Search API](https://docs.ted.europa.eu/api/latest/search.html)
- [Schéma TED v3](https://api.ted.europa.eu/api-v3.yaml)
- [GitHub Repository Contents API](https://docs.github.com/en/rest/repos/contents)
