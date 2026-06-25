# syntax=docker/dockerfile:1.7

# Dashboard Node.js 실행 환경
FROM node:24-alpine

WORKDIR /app

# packageManager 기준 pnpm 활성화
RUN corepack enable

# 의존성 설치 파일 우선 복사
COPY package.json pnpm-lock.yaml ./

# pnpm Store 캐시를 사용한 의존성 설치
RUN --mount=type=cache,id=officeguard-dashboard-pnpm,target=/pnpm/store \
    pnpm install \
      --frozen-lockfile \
      --store-dir=/pnpm/store

# Dashboard 설정과 소스 복사
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src

# Vite Dashboard 실행
CMD ["pnpm", "dev"]