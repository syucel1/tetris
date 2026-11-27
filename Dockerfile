# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS node

FROM eclipse-temurin:21-jdk-jammy AS build
COPY --from=node /usr/local/ /usr/local/
WORKDIR /app

COPY gradlew build.gradle settings.gradle package.json package-lock.json tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY gradle/ gradle/
COPY src/ src/
COPY server/ server/
ARG VITE_LOG_LEVEL=INFO
ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL}
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew
RUN --mount=type=cache,target=/root/.gradle \
    --mount=type=cache,target=/root/.npm \
    ./gradlew build --no-daemon --console=plain

# Account API: Node runs the TypeScript sources directly (type stripping), so only runtime
# dependencies and the shared rule modules are copied. Tests and type checks ran in "build".
FROM node:22-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund
COPY server/src/ server/src/
COPY src/accounts/rules.ts src/accounts/
COPY src/profiles/profiles.ts src/profiles/
COPY src/ui/palettes.ts src/ui/
RUN rm -f server/src/*.test.ts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]

FROM nginx:stable-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY roadmap.html roadmap.md /usr/share/nginx/html/
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
