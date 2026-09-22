# 開発用イメージ (Vite dev server)。ビルドコンテキストはリポジトリルート。
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter web...

COPY packages/shared packages/shared
COPY apps/web apps/web

EXPOSE 5173

CMD ["pnpm", "--filter", "web", "dev"]
