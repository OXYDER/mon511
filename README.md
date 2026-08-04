# mon511.ca / my511.ca

Plateforme communautaire de signalement d'incidents routiers à l'échelle du Canada.

## Structure du dépôt

```
mon511-repo/
├── docker-compose.yml       # PostgreSQL+PostGIS, Redis, MinIO, API, client web
├── .env.example              # copier vers .env et remplir
├── api/                       # backend NestJS
│   └── src/
│       ├── database/migrations/   # 0001_init.sql (schéma), 0002_seed.sql (données de départ)
│       ├── auth/                  # inscription, connexion, JWT, garde de rôles
│       ├── email/                 # service courriel (repli console si SMTP absent)
│       └── modules/
│           ├── reports/           # signalements, géospatial, confirmer/signaler/suggérer résolu
│           ├── users/             # profil, confidentialité, mes signalements
│           ├── moderation/        # file, décision, fil de réponse
│           ├── comments/          # commentaires publics sur un signalement
│           ├── messaging/         # messagerie privée (respecte dm_permission)
│           ├── uploads/           # upload de photos vers MinIO
│           ├── problem-types/
│           ├── regions/
│           ├── notifications/
│           ├── municipality-integrations/
│           └── external-data/         # couche officielle MTMD, distincte des signalements communautaires
└── web/                        # client React + Vite
    └── src/
        ├── api.ts               # client HTTP + gestion du jeton JWT
        └── pages/                # Auth, Map, CreateReport, ReportDetail, Profile
```

## État actuel — premier déploiement fonctionnel

Contrairement aux versions précédentes de ce README, **le projet est maintenant déployable de bout en bout** : `docker compose up` démarre tous les services sans planter, et le parcours principal fonctionne (inscription, connexion, création d'un signalement avec géolocalisation, confirmer/signaler/suggérer résolu, commentaires, modération).

**Compilation vérifiée** : `npx tsc --noEmit` (API) et `npm run build` (web) passent tous les deux sans erreur.

### Simplifications assumées pour ce premier déploiement

Pour livrer quelque chose de fonctionnel rapidement plutôt qu'une architecture parfaite, certains choix ont été simplifiés — documentés ici pour qu'on sache quoi améliorer :

| Simplifié | Impact | À faire plus tard |
|---|---|---|
| **Pas de vraie file BullMQ** | Les notifications et l'envoi aux municipalités s'exécutent directement dans la requête HTTP plutôt que dans un worker asynchrone séparé. | Migrer vers de vrais jobs BullMQ si le volume grandit — la logique métier ne change pas, seulement où elle s'exécute. |
| **Sync des données MTMD manuelle** | La couche officielle (`external-data`) se synchronise via un endpoint admin (`POST /external-data/sources/:feedKey/sync`), pas automatiquement. | Ajouter un `@Cron()` NestJS qui appelle `syncSource` selon `sync_frequency_minutes` de chaque source. |
| **Pas de purge automatique programmée** | Le job de purge des signalements refusés après 1 an (§ modèle de données) n'a pas de cron réel. | Ajouter un `@Cron()` NestJS ou un job BullMQ répété. |
| **Régions sans frontières géographiques réelles** | Les régions de départ (`0002_seed.sql`) n'ont pas de polygone `boundary` — la dérivation automatique de région à la création d'un signalement retombe donc sur `null`. | Importer de vraies limites (ex. Statistique Canada, limites des divisions de recensement). |
| **Carte non intégrée dans le client web** | Le client web actuel affiche les signalements en liste, pas sur une vraie carte MapLibre — les maquettes HTML montraient la carte, mais l'intégrer avec de vraies tuiles est un chantier à part. | Brancher MapLibre GL + un fournisseur de tuiles (MapTiler suggéré dans la discussion stack technique). |
| **Courriel simulé sans SMTP configuré** | Si `SMTP_HOST` n'est pas rempli dans `.env`, les courriels sont journalisés dans les logs au lieu d'être envoyés. | Configurer un vrai fournisseur SMTP (Resend, Postmark, etc.) dans `.env`. |
| **Pas de tests automatisés** | Jest est configuré mais aucun test n'est écrit. | À bâtir au fur et à mesure, en priorité sur les règles métier sensibles (motif de refus obligatoire, seuil pondéré de résolution). |
| **Pas de CI/CD** | Aucun GitHub Actions, contrairement à ton habitude sur Resofy. | À ajouter une fois le rythme de développement stabilisé. |

## Démarrage local

```bash
cp .env.example .env
# remplir les mots de passe et clés dans .env — voir la section "Ports"
# ci-dessous si tu as déjà des services actifs sur les ports par défaut

docker compose up -d
# postgres exécute automatiquement 0001_init.sql puis 0002_seed.sql au premier démarrage
```

Une fois démarré :
- Client web : http://localhost:5173 (ou le port choisi via `WEB_HOST_PORT`)
- API : http://localhost:3000/api (santé : http://localhost:3000/api/health)
- Console MinIO : http://localhost:9001

### Ports

Tous les ports exposés à l'hôte sont configurables dans `.env` (`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`, `MINIO_API_HOST_PORT`, `MINIO_CONSOLE_HOST_PORT`, `API_HOST_PORT`, `WEB_HOST_PORT`) — pratique si un de ces ports est déjà pris par un autre service Docker sur ton NAS.

## Prochaines étapes suggérées

1. Tester le parcours complet une fois démarré, et noter ce qui doit changer.
2. Intégrer MapLibre GL dans le client web pour retrouver la vraie carte des maquettes.
3. Importer de vraies frontières géographiques pour les régions.
4. Migrer les effets de bord synchrones (notifications, envoi municipal) vers de vrais jobs BullMQ.
5. Ajouter le cron de purge automatique.
6. Écrire les premiers tests sur les règles métier critiques.

Voir `mon511-modele-donnees.md` pour le détail complet de chaque table et des règles métier associées.

