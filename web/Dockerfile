FROM node:22-alpine AS builder

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY resultados_referencia/ ./resultados_referencia/
# Endereço público usado nas imagens de compartilhamento das páginas pré-renderizadas.
ARG NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
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

# O proxy do Coolify (Traefik) descobre a porta do serviço por aqui.
EXPOSE 3000

CMD ["node", "server.js"]
