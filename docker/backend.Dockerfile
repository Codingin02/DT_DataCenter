FROM node:24.20.0-alpine3.24 AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY node_modules ./node_modules
RUN npm prune --omit=dev --ignore-scripts --offline --no-audit --no-fund

FROM node:24.20.0-alpine3.24

ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node backend ./backend
COPY --chown=node:node docs/contracts ./docs/contracts
COPY --chown=node:node frontend/dist ./frontend/dist
USER node
EXPOSE 3000
CMD ["node", "backend/server.js"]
