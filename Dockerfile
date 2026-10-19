# Synovra web app image. Build from the repository root:  docker build -t synovra-web .
#
# The app calls the API on the SAME ORIGIN (/api/v1), so the image contains no host name: put it behind any
# reverse proxy or ingress that sends /api, /health and /ready to the API and everything else here
# (see deploy/Caddyfile). Changing the public address never needs a rebuild.
FROM node:20.17-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone NEXT_PUBLIC_DATA_SOURCE=http NEXT_PUBLIC_API_BASE_URL=
RUN npx next build

FROM node:20.17-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/signin >/dev/null || exit 1
CMD ["node", "server.js"]
