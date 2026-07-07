# データ構造 ―（成果物⑤）

M0の入出力データを JSON 構造として確定する（§1〜§3が実装対象）。
§5はM1以降の保存対象の**転写草案**（凍結設計からの引き写し。M1のG11/G12ラウンドで凍結）であり、M0では実装しない。

---

## 1. WorldPack（pack.json）——M0の主データ構造

パックスキーマ設計書§2の JSON 表現。TypeScript型はこの構造と一対一（逐条突合テスト対象）。

```jsonc
{
  "meta": {
    "packId": "fixtures.mini",
    "packName": "検証用ミニパック",
    "version": "0.1.0",
    "engineSchemaVersion": "1.0",   // エンジンは同一majorのみ受理
    "sourceNote": "テスト用の架空世界"
  },
  "geography": {
    "nodes": [
      { "id": "node.riverfort", "nodeType": "県城", "wealth": 40, "population": 60,
        "publicOrder": 50, "sentiment": 55, "enforcement": 45, "defense": 30,
        "encounterWeight": 1.0, "regionTag": "east" },
      { "id": "node.ferry", "nodeType": "通過点", "wealth": 10, "population": 5,
        "publicOrder": 30, "sentiment": 50, "enforcement": 10, "defense": 10,
        "encounterWeight": 3.0, "regionTag": "east" }
    ],
    "edges": [
      { "id": "edge.e1", "from": "node.riverfort", "to": "node.ferry", "kind": "幹線", "distance": 2 }
    ]
  },
  "agents": {
    "explicit": [
      { "id": "agent.stone", "familyName": "石", "givenName": "堅", "nickname": "vocab.nick.rock",
        "origin": "vocab.origin.soldier", "startPost": "post.guard-captain", "startNode": "node.riverfort",
        "aptitudes": { "valor": 70, "intellect": 40, "leadership": 55, "charisma": 45, "craft": 30 },
        "values": { "altruism": 60, "loyalty": 80, "ambition": 30, "acquisition": 20,
                     "aggression": 45, "caution": 65, "face": 70, "attachment": 50 },
        "initialRelations": [
          { "target": "agent.reed", "kind": "同僚", "axes": { "affection": 40, "trust": 50 } }
        ],
        "initialAssets": 20,
        "initialFame": [ { "community": "community.officialdom", "value": 30 } ],
        "sourceNote": "架空。S/A層はこの注記が必須（検証で強制）" }
    ],
    "archetypes": [
      { "id": "arch.brave", "nameRef": "vocab.arch.brave",
        "valueDistributions": { "aggression": { "mean": 70, "stddev": 15 } },
        "aptitudeBias": { "valor": 20 }, "originVocab": "vocab.origin.hunter" }
    ],
    "generation": { "initialBackgroundCount": { "min": 10, "max": 20 }, "successionParams": {} }
  },
  "institutions": [
    { "id": "inst.county", "nameRef": "vocab.inst.county", "jurisdiction": ["node.riverfort"],
      "rules": [
        { "ruleKind": "処罰", "params": { "brandingEnabled": true, "escortRequired": true } },  // CR-1の器
        { "ruleKind": "移送", "params": { "trunkRoadOnly": true } },
        { "ruleKind": "課税", "params": { "rate": 0.2 } }
      ],
      "posts": [
        { "id": "post.guard-captain", "nameRef": "vocab.post.guard", "capacity": 1,
          "salary": 5, "actionTags": ["patrol", "escort"], "faceValue": 40 }
      ],
      "corruption": 60, "legitimacy": 70 }
  ],
  "skills": [
    { "id": "skill.volley", "nameRef": "vocab.skill.volley",
      "composition": [ { "primitive": "投射", "params": { "strayCheck": true, "volume": 3 } } ],
      "witnessTag": null, "acquisition": { "aptitudeMin": { "valor": 40 }, "rarity": "common" } }
  ],
  "causes": [
    { "id": "cause.defend-home", "nameRef": "vocab.cause.defend",
      "valueProfile": { "attachment": 80 }, "hostilityTarget": "なし", "legitimacyBase": "自衛" }
  ],
  "agitation": [
    { "id": "agit.flood", "kind": "災害", "nameRef": "vocab.agit.flood",
      "target": "east", "frequencyBand": { "meanIntervalYears": 12 }, "intensity": { "sentimentDrop": 15 } }
  ],
  "vocabulary": {
    "personNames": { "familyPool": ["石", "葦", "岡"], "givenRules": { "singleCharPool": ["堅", "青"] } },
    "nicknames": { "rules": [ { "category": "性向", "key": "aggression>=70", "pool": ["vocab.nick.rock"] } ] },
    "titleTemplates": [ "{地名}の{戦い|乱|変}" ],          // プレースホルダ置換のみ。条件分岐は構文エラー
    "speech": { "entries": [ { "scene": "挑発", "personality": "aggression-high", "relation": "敵対",
                                 "lines": ["去ね、それとも試すか。"] } ] },
    "chroniclerStyle": { "tone": "plain" },
    "displayNames": { "values.altruism": "義侠" },          // エンジン抽象軸→文化的表示名
    "communities": [ { "id": "community.officialdom", "nameRef": "vocab.comm.official" },
                      { "id": "community.rivers", "nameRef": "vocab.comm.rivers" } ],   // CR-3の器
    "entries": { "vocab.nick.rock": "岩塊", "vocab.inst.county": "県府", "...": "（全VocabKeyの実体文字列）" }
  },
  "eraParams": { "lifespan": { "mean": 55, "stddev": 12 }, "moveSpeed": { "foot": 1, "horse": 3, "boat": 2 },
                  "currency": "貫", "banquetFrequency": 1.5 },
  "evaluationOverrides": {
    "permanent": { "不義の目撃": 2.0, "公衆侮辱": 1.8 },
    "temporaryStates": { "飲酒": { "axisMultipliers": { "caution": 0.5, "face": 1.3 }, "durationTicks": 1 } }  // CR-2の器
  }
}
```

**構造上の強制（再掲）**: `initialRelations.kind` は `血縁|婚姻|師弟|同僚` の4値のみ（白紙原則）。怨恨・恩義・運命フラグのフィールドは存在しない。特定ノード優遇フラグも存在しない（偏在の禁止）。

## 2. ValidationReport（validate-pack の出力）

```jsonc
{ "ok": false,
  "packId": "fixtures.mini",
  "issues": [
    { "ruleId": "constitution/relation-whitelist", "severity": "error",
      "path": "agents.explicit[0].initialRelations[1].kind",
      "message": "初期関係種別 '怨恨' は許可されない（白紙原則）" }
  ],
  "counts": { "error": 1, "warning": 0 } }
```

## 3. WorldEvent 封筒（M0は型のみ。世界設計書§13.3の転写）

```jsonc
{ "id": "evt.000123", "tick": 4520, "type": "（G11ラウンドで正式化）",
  "actors": ["agent.stone"], "witnesses": ["agent.reed"], "location": "node.ferry",
  "causes": ["evt.000098"], "payload": {}, "salience": 60 }
```

## 4. AuditReport（audit-lexicon の出力）

```jsonc
{ "ok": false,
  "lexiconSize": 214,
  "hits": [ { "file": "packages/core/src/domain/pack/geography.ts", "line": 42,
               "token": "県府", "context": "identifier|string|comment" } ] }
```

## 5. M1以降の保存対象（転写草案——M0実装禁止・参照のみ）

凍結設計からの引き写し。**凍結はM1のG11（イベント）／G12（ログ・セーブ）ラウンドで行う。** ここに載せる目的は、M0の型設計が将来構造と矛盾しないことの視界確保のみ。

| 構造 | 転写元 | 骨子 |
|---|---|---|
| `SaveData` | 世界§15 | `{ seed, engineVersion, packId, snapshot, logSegmentRefs[] }`。インデックス非含有（再構築） |
| `Snapshot` | 世界§15 | 全集約の直列化＋乱数ストリーム状態 |
| `EventLog` | 世界§13.3/§15 | WorldEvent の append-only 列。年単位セグメント化・圧縮。物語参照分は永久保持 |
| `Character(Agent)` | 世界§3.1/§13.1 | 素質・価値観・欲求・目標スタック・記憶（上限128・不滅記憶）・身体・社会状態（烙印含む=CR-1、観衆別名声=CR-3） |
| `Faction` | 世界§8/§13.1 | 構成員・拠点（ゼロ可）・国庫・方針・大義参照 |
| `Map(WorldGeo)` | 世界§4.1 | パック地理の実行時複製＋恒久地形変化（延焼・封鎖の書き戻し先） |
| `StoryPackage` | 世界§13.3 | `{ id, title, protagonists[], region, span, beats[], outcome, quality }` |
| `LedgerEntry` | 世界§13.3 | `{ 種別(恩義/怨恨), causeEventId, weight, settled }` |
