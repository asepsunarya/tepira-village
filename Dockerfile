# Production image for tepira-village (built by .github/workflows/image.yml, pushed to GHCR).
# Village never runs migrations (the schema is owned by tepira).
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . ./
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
USER node
EXPOSE 3000
CMD ["npx","next","start","-p","3000"]
