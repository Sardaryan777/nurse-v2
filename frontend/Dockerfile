# ── Frontend: build the Vite React app, then serve it with Express ───────────
FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Only the deps needed to run server.js
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "server.js"]
