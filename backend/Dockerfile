FROM node:24-alpine AS base

WORKDIR /app

# 로컬 프로젝트와 동일한 pnpm 버전을 이미지에 설치
RUN npm install --global pnpm@10.34.3

# 의존성 변경이 없을 때 Docker layer cache를 활용할 수 있도록  package 파일을 소스 코드보다 먼저 복사
COPY package.json pnpm-lock.yaml ./

# 운영 환경에 필요한 의존성만 설치
FROM base AS production-dependencies

RUN pnpm install --prod --frozen-lockfile

# TypeScript 빌드를 위한 전체 의존성을 설치
FROM base AS build

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

# 실제 애플리케이션을 실행하는 최종 이미지
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

# 운영 의존성과 빌드 결과만 최종 이미지에 복사
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# root 권한이 아닌 Node 이미지 기본 사용자로 서버를 실행
USER node

EXPOSE 4000

CMD ["node", "dist/index.js"]