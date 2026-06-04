import { elizaLogger, type Plugin } from "@elizaos/core";
import { YayaJournal } from "./yaya-journal.js";
import { createYayaGrowthProvider } from "./yaya-growth-provider.js";
import path from "node:path";
import fs from "node:fs";

/**
 * x-bot 成长系统插件
 *
 * 为 Yaya Xu 提供：
 * - 成长日记持久化（data/yaya-journal.jsonl）
 * - 上下文注入（让 Yaya 记得自己过去的经历和成长）
 *
 * 日记文件存储在 PGLITE_DATA_DIR 对应的 data/ 目录下。
 * 日记不会被发送到外部服务，仅本地存储。
 *
 * 使用方式：
 * 1. 在 character.json 的 plugins 中添加 "@elizaos/plugin-x-bot"
 * 2. 日记条目通过 scripts/reflect.sh 或手动追加
 * 3. Provider 自动在每次上下文中注入最近的日记条目
 */
export const xBotGrowthPlugin: Plugin = {
  name: "@elizaos/plugin-x-bot",
  description:
    "Yaya's growth system — persistent journal and evolving memory for a realistic human persona",

  async init(_config, runtime) {
    // 确定日记文件存储路径
    const pgliteDir = process.env.PGLITE_DATA_DIR || "./data/pglite";
    const dataDir = path.resolve(pgliteDir, "..");
    fs.mkdirSync(dataDir, { recursive: true });

    const journal = new YayaJournal(dataDir);

    elizaLogger.info(
      `[x-bot] Growth journal at ${journal.path} (${journal.count()} entries)`,
    );

    // 注册成长上下文注入器
    runtime.registerProvider(createYayaGrowthProvider(journal));
    elizaLogger.info("[x-bot] Registered yaya-growth context provider");
  },
};

export default xBotGrowthPlugin;

export { YayaJournal, createYayaGrowthProvider };
export type { JournalEntry, JournalEntryType } from "./yaya-journal.js";
