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
│   │   ├── prisma/     schema.prisma / migrations
│   │   ├── scripts/    import.ts (data/ → DB)
│   │   └── src/
│   └── web/            Vite + React
├── packages/
│   └── shared/         フロント・バック共通の型と定数
├── data/               楽曲・地力表のマスタ JSON (詳細は data/README.md)
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

`api` コンテナは起動時に `prisma migrate deploy` → `data/` の取り込み (`db:import`) → dev サーバ起動を行います。
取り込みは冪等なので、`data/` の JSON を編集して再起動（または `pnpm db:import`）すれば DB に反映されます。

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
# 対話可能なターミナルの場合
docker compose run --rm api pnpm --filter api exec prisma migrate dev --name <name>

# 非対話環境では diff で SQL を生成し、再起動時の migrate deploy で適用
docker compose run --rm api sh -c 'cd apps/api && d=prisma/migrations/$(date +%Y%m%d%H%M%S)_<name> && mkdir -p $d && pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > $d/migration.sql'
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
| GET | `/api/records` | 現在ユーザーの記録一覧 |
| PUT | `/api/records/:chartId` | 記録を作成 / 更新 (`{ clearType, exScore, missCount }`) |
| DELETE | `/api/records/:chartId` | 記録を削除 |

「現在ユーザー」はログイン機能ができるまで `id=1` のローカルユーザーに固定しています
(`apps/api/src/currentUser.ts`)。認証を入れるときはこのミドルウェアだけ差し替えます。

## データモデル

```text
Song ──< Chart ──< SheetEntry >── Tier >── Sheet
            └───< ChartRecord >── User
```

- `Song` 楽曲、`Chart` 譜面 (SP/DP × 難易度 × レベル)
- `Sheet` 表 (例: SP☆12 ノマゲ)、`Tier` 帯 (地力S+ など)、`SheetEntry` 表の 1 マス
- `User` プレイヤー、`ChartRecord` プレイヤー × 譜面の最新記録 (クリアタイプ / EX スコア / ミスカウント)。
  マスタ (`Song` / `Chart`) は `data/` からの import で上書きされるため、個人の記録は別テーブルに持つ

## データ

`data/songs.json`（SP☆12 の楽曲・譜面）と `data/sheets/sp12-normal.json`（SP☆12 ノマゲ参考表）を
`apps/api/scripts/import.ts` で取り込みます。フォーマットと出典は [data/README.md](data/README.md) を参照。

```bash
pnpm db:import   # = docker compose exec api pnpm --filter api db:import
```
