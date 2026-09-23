# data/

DB に取り込むマスタデータ。`pnpm --filter api db:import`（`apps/api/scripts/import.ts`）で投入します。
取り込みは冪等で、`api` コンテナ起動時にも自動実行されます。

## ファイル

### `songs.json`

楽曲と譜面。`title` が一意キーです（同名曲があれば別途対応）。

```json
[
  {
    "title": "冥",
    "artist": null,
    "genre": null,
    "version": null,
    "bpm": null,
    "charts": [
      { "playStyle": "SP", "difficulty": "ANOTHER", "level": 12, "notes": null }
    ]
  }
]
```

- `playStyle`: `SP` | `DP`
- `difficulty`: `BEGINNER` | `NORMAL` | `HYPER` | `ANOTHER` | `LEGGENDARIA`
- `version`: 初出 AC バージョン番号（1 = 1st style, 11 = IIDX RED, 30 = RESIDENT, 34 = ZINRAI）。対応表は `packages/shared/src/index.ts` の `VERSIONS`
- `artist` / `genre` / `version` / `bpm` / `notes` は任意（未入力は `null`）

### `sheets/*.json`

地力表。1 ファイル = 1 表。`tiers` の配列順がそのまま表示順（上 = 難しい）です。

```json
{
  "slug": "sp12-normal",
  "name": "SP☆12 ノマゲ参考表",
  "description": "...",
  "playStyle": "SP",
  "level": 12,
  "source": { "name": "...", "url": "...", "fetchedAt": "YYYY-MM-DD" },
  "tiers": [
    {
      "name": "地力S+",
      "kind": "JIRIKI",
      "entries": [{ "title": "GuNGNiR", "difficulty": "LEGGENDARIA" }]
    }
  ]
}
```

- `kind`: `JIRIKI`（地力） | `KOJINSA`（個人差） | `UNRATED`（難易度未定）
- `entries[].title` + `difficulty`（+ 省略可の `playStyle`）で `songs.json` の譜面を参照します。見つからない場合は import がエラーになります。
- JSON から消した帯・譜面は DB からも削除されます。

## 現在のデータ

- `songs.json`: SP☆12 の楽曲のみ（643 曲 / 675 譜面）。
  - `version` / `artist` / `genre`: [デラレコ](https://record.iidx.app/) の公開 API（2026-09-24 時点）
  - `bpm` / `notes`: [TexTage](https://textage.cc/) の `datatbl.js`（2026-09-24 時点）。曲名の表記ゆれ（`Ø`→`O`/`0`、`И`→`N`、`Æ`→`A`/`ae` など）は正規化して照合
  - 未取得: `POLKAMANIA` / `X-DEN` / `火影` の `bpm` と `notes`（TexTage に未収録のため）
- `sheets/sp12-normal.json`: SP☆12 ノマゲ参考表。分類は [デラレコ](https://record.iidx.app/sheets/1) の 2026-09-23 時点の表を参照。

分類は参考元の更新に追従しないため、必要に応じて手で編集してください。
