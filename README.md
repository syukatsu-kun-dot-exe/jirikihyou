# jirikihyou

beatmania IIDX の地力表（難易度参考表）サイト。個人開発・学習用。

## 技術スタック

| 層 | 技術 |
|---|---|
| フロント | Vite + React + TypeScript (`apps/web`) |
| バック | Hono + TypeScript (`apps/api`) |
| ORM / DB | Prisma + PostgreSQL 16 |
| 共有型 | `packages/shared` |
| 開発環境 | Docker Compose (web / api / db) |
| パッケージ管理 | pnpm workspace (monorepo) |

## ディレクトリ構成

```text
.
├── apps/
│   ├── api/            Hono API
│   │   ├── prisma/     schema.prisma / migrations / seed.ts
│   │   └── src/
│   └── web/            Vite + React
├── packages/
│   └── shared/         フロント・バック共通の型と定数
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## 起動方法 (Docker)

前提: Docker Desktop が起動していること。

```bash
docker compose up --build
```

| サービス | URL |
|---|---|
| web | http://localhost:5173 |
| api | http://localhost:3000/health , http://localhost:3000/api/sheets |
| db | `postgresql://jirikihyou:jirikihyou@localhost:5432/jirikihyou` |

`api` コンテナは起動時に `prisma migrate deploy` → `prisma db seed` → dev サーバ起動を行います。
シードは楽曲が 0 件のときだけ投入されます。

ポートや DB 資格情報を変える場合は `.env.example` を `.env` にコピーして編集してください（無くても動きます）。

停止:

```bash
docker compose down        # コンテナ停止
docker compose down -v     # DB データも削除
```

## 開発時のメモ

- `apps/*/src`, `apps/api/prisma`, `packages/shared/src` はバインドマウントされているので、編集すると自動でリロードされます。
- `package.json` の依存を変更したときは `docker compose up --build` でイメージを作り直してください。
- ホスト側で型チェックするには依存をインストールしてから:

  ```bash
  pnpm install
  pnpm --filter api exec prisma generate
  pnpm -r typecheck
  ```

### Prisma

スキーマ変更 → マイグレーション生成（コンテナ内で実行。生成物はホストの `apps/api/prisma/migrations` に出ます）:

```bash
docker compose exec api pnpm --filter api exec prisma migrate dev --name <name>
```

Prisma Studio:

```bash
docker compose exec api pnpm --filter api exec prisma studio --hostname 0.0.0.0 --port 5555
# → http://localhost:5555
```

## API (暫定)

| Method | Path | 内容 |
|---|---|---|
| GET | `/health` `/api/health` | 稼働確認 (DB 接続込み) |
| GET | `/api/songs` | 楽曲 + 譜面一覧 |
| GET | `/api/sheets` | 表の一覧 |
| GET | `/api/sheets/:idOrSlug` | 表の詳細 (帯 → 譜面 → 楽曲) |

## データモデル

```text
Song ──< Chart ──< SheetEntry >── Tier >── Sheet
```

- `Song` 楽曲、`Chart` 譜面 (SP/DP × 難易度 × レベル)
- `Sheet` 表 (例: SP☆12 ノマゲ)、`Tier` 帯 (地力S+ など)、`SheetEntry` 表の 1 マス

楽曲マスタの投入方法は今後決定。現状はサンプル数曲のみ (`apps/api/prisma/seed.ts`)。
