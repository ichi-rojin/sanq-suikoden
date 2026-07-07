// 責務: 全パックの語彙・実体名から禁止トークン集合を生成する（検出器仕様書§5.1。手書き禁止リストは作らない）
import type { WorldPack } from "@world/core";

export interface BanLexiconEntry {
  readonly token: string;
  readonly sourcePack: string;
  readonly sourcePath: string;
}

export class BanLexicon {
  constructor(private readonly items: readonly BanLexiconEntry[]) {}

  get entries(): readonly BanLexiconEntry[] {
    return this.items;
  }

  has(token: string): boolean {
    return this.items.some((entry) => entry.token === token);
  }
}

export class BanLexiconBuilder {
  build(packs: readonly WorldPack[]): BanLexicon {
    const seen = new Map<string, BanLexiconEntry>();

    const addToken = (rawToken: string, packId: string, sourcePath: string): void => {
      const token = rawToken.trim();
      if (token.length === 0 || seen.has(token)) {
        return;
      }
      seen.set(token, { token, sourcePack: packId, sourcePath });
    };

    for (const pack of packs) {
      const packId = pack.meta.packId;

      for (const [key, value] of Object.entries(pack.vocabulary.entries)) {
        addToken(value, packId, `vocabulary.entries.${key}`);
      }

      pack.vocabulary.personNames.familyPool.forEach((name, index) => {
        addToken(name, packId, `vocabulary.personNames.familyPool[${index}]`);
      });

      pack.agents.explicit.forEach((agent, index) => {
        addToken(agent.familyName, packId, `agents.explicit[${index}].familyName`);
        addToken(agent.givenName, packId, `agents.explicit[${index}].givenName`);
      });
    }

    return new BanLexicon(Array.from(seen.values()));
  }
}
