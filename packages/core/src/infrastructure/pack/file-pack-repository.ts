// 責務: fsからpack.jsonを読み取るリポジトリ実装（Node API使用はここが上限）
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PackRepository } from "../../application/pack/pack-repository";
import type { RawPackSource } from "../../application/pack/raw-pack-source";

const PACK_FILE_NAME = "pack.json";

export class FilePackRepository implements PackRepository {
  async load(source: string): Promise<RawPackSource> {
    const filePath = join(source, PACK_FILE_NAME);
    const text = await readFile(filePath, "utf-8");
    return { text, origin: filePath };
  }
}
