FROM node:22-alpine AS builder

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY resultados_referencia/ ./resultados_referencia/
RUN npm run build

FROM node:22-alpine

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/resultados_referencia ./resultados_referencia
USER node

CMD ["node", "server.js"]
