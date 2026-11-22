FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY data/evaluated.json ./data/evaluated.json
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NOMOS_HOST=0.0.0.0 PORT=4173
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/core/contracts.ts ./src/core/contracts.ts
USER node
EXPOSE 4173
CMD ["node", "server/start.mjs"]
