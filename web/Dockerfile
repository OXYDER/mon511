FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Contrairement au serveur de développement (qui lit les variables
# d'environnement à chaque requête), Vite les fige DANS le code au moment
# du "build" — il faut donc les recevoir ici en argument de construction,
# pas seulement comme variable d'environnement au démarrage du conteneur.
ARG VITE_API_URL
ARG VITE_MAPTILER_API_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAPTILER_API_KEY=$VITE_MAPTILER_API_KEY
# Numéro de version basé sur l'horodatage exact du build — évolue tout
# seul à chaque déploiement, sans avoir à gérer un compteur séparé. Chargé
# automatiquement par Vite (fichier .env.production.local, prioritaire).
RUN echo "VITE_BUILD_VERSION=$(date -u +%Y.%m.%d-%H%M)" > .env.production.local
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
