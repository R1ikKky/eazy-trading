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
RUN NODE_OPTIONS=--max-old-space-size=1024 npm run build:frontend

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
WORKDIR /app/frontend
EXPOSE 3000
CMD ["node", "server.js"]
