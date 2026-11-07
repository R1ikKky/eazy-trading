FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY packages/orderflow/package.json ./packages/orderflow/package.json
RUN npm ci
COPY packages/orderflow ./packages/orderflow
COPY frontend ./frontend
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_INTERNAL_URL=http://api:3001
RUN npm run build:frontend

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/orderflow ./packages/orderflow
COPY --from=build --chown=node:node /app/frontend/package.json ./frontend/package.json
COPY --from=build --chown=node:node /app/frontend/.next ./frontend/.next
COPY --from=build --chown=node:node /app/frontend/next.config.ts ./frontend/next.config.ts
USER node
WORKDIR /app/frontend
EXPOSE 3000
CMD ["node", "../node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
