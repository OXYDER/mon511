# mon511.ca / my511.ca

Plateforme communautaire de signalement d'incidents routiers à l'échelle du Canada.

## Structure du dépôt

```
mon511-repo/
├── docker-compose.yml       # PostgreSQL+PostGIS, Redis, MinIO, API, client web (dev)
├── .env.example             # copier vers .env et remplir
└── api/
    ├── src/
    │   ├── database/migrations/0001_init.sql   # schéma complet (voir mon511-modele-donnees.md)
    │   ├── modules/
    │   │   ├── reports/          # signalements — module de référence, le plus complet
    │   │   ├── users/
    │   │   ├── problem-types/
    │   │   ├── regions/
    │   │   ├── moderation/
    │   │   ├── notifications/
    │   │   └── municipality-integrations/
    │   ├── app.module.ts
    │   └── main.ts
    └── package.json
```

## État actuel du scaffolding

- **Schéma de base de données** : complet, dérivé directement de `mon511-modele-donnees.md` (v0.12). Toutes les tables, enums, contraintes et valeurs par défaut des paramètres sont en place.
- **`docker-compose.yml`** : complet et prêt à lancer.
- **Module `reports`** : structure complète (contrôleur, service, DTO) avec les patrons de requêtes PostGIS attendus (recherche géospatiale "près de moi", dérivation automatique de la région). Les requêtes SQL sont écrites mais pas encore branchées à un vrai client de base de données — à faire lors de l'implémentation.
- **Autres modules** (`users`, `problem-types`, `regions`, `moderation`, `notifications`, `municipality-integrations`) : squelettes vides (module/service/contrôleur), à remplir un par un en suivant le patron du module `reports`.

## Démarrage local

```bash
cp .env.example .env
# remplir les mots de passe et clés dans .env

docker compose up -d postgres redis minio
# la migration 0001_init.sql s'exécute automatiquement au premier démarrage de postgres

cd api
npm install
npm run start:dev
```

## Prochaines étapes suggérées

1. Brancher un vrai client de base de données (Kysely est déjà dans `package.json` — donne un typage TypeScript généré à partir du schéma SQL, plus léger qu'un ORM complet comme Prisma/TypeORM pour ce genre de requêtes géospatiales).
2. Implémenter l'authentification (JWT + refresh tokens, ou Passport.js pour OAuth Google/Apple vu dans la maquette de connexion).
3. Remplir les modules `users`, `problem-types`, `regions` en suivant le patron de `reports`.
4. Brancher BullMQ pour les tâches asynchrones : purge des signalements refusés, recalcul de réputation, envoi des notifications aux municipalités.
5. Client web React + Vite (dossier `web/` à créer, référencé dans `docker-compose.yml`).

Voir `mon511-modele-donnees.md` pour le détail complet de chaque table et des règles métier associées.
