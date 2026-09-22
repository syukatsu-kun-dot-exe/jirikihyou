# 開発用イメージ (ホットリロード)。ビルドコンテキストはリポジトリルート。
FROM node:22-bookworm-slim

# Prisma engine に openssl が必要
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# 依存関係の解決に必要なファイルだけ先にコピーしてキャッシュを効かせる
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter api...

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter api exec prisma generate

EXPOSE 3000

# 起動時にマイグレーション適用 → シード → dev サーバ
CMD ["sh", "-c", "pnpm --filter api exec prisma migrate deploy && pnpm --filter api db:seed && pnpm --filter api dev"]
