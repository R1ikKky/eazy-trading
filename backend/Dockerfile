FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY packages/orderflow/package.json ./packages/orderflow/package.json
RUN npm ci
COPY packages/orderflow ./packages/orderflow
COPY backend ./backend
RUN npm run build:backend

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/providers/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/databento && /opt/databento/bin/pip install --no-cache-dir -r /tmp/requirements.txt
ENV DATABENTO_PYTHON=/opt/databento/bin/python
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/orderflow ./packages/orderflow
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --chown=node:node backend/providers ./backend/providers
COPY --chown=node:node data ./data
COPY --chown=node:node market-archives ./market-archives
USER node
WORKDIR /app/backend
EXPOSE 3001
CMD ["node", "dist/main.js"]
