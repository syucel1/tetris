# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS node

FROM eclipse-temurin:21-jdk-jammy AS build
COPY --from=node /usr/local/ /usr/local/
WORKDIR /app

COPY gradlew build.gradle settings.gradle package.json package-lock.json tsconfig.json index.html ./
COPY gradle/ gradle/
COPY src/ src/
ARG VITE_LOG_LEVEL=INFO
ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL}
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew
RUN --mount=type=cache,target=/root/.gradle \
    --mount=type=cache,target=/root/.npm \
    ./gradlew build --no-daemon --console=plain

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
