# ───────── build stage : Vite 정적 빌드 ─────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite 빌드타임 주입 키(없으면 빈 값 → 해당 소셜버튼 자동 숨김). compose args → .env 로 전달.
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_GITHUB_CLIENT_ID=
ARG VITE_KAKAO_REST_KEY=
ARG VITE_TOSS_CLIENT_KEY=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_GITHUB_CLIENT_ID=$VITE_GITHUB_CLIENT_ID \
    VITE_KAKAO_REST_KEY=$VITE_KAKAO_REST_KEY \
    VITE_TOSS_CLIENT_KEY=$VITE_TOSS_CLIENT_KEY
RUN npm run build

# ───────── serve stage : nginx 정적 + /api 프록시 ─────────
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
