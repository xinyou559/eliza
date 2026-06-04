import fs from "node:fs";
import path from "node:path";

/**
 * 日记条目类型
 */
export type JournalEntryType =
  | "daily_reflection"
  | "trading_review"
  | "lesson_learned"
  | "opinion_change"
  | "milestone"
  | "emotional_moment";

/**
 * 单条日记
 */
export interface JournalEntry {
  type: JournalEntryType;
  timestamp: string; // ISO 8601
  content: string;
  /** 关联的话题标签 */
  topics?: string[];
  /** 交易复盘专用字段 */
  trading?: {
    symbol?: string;
    pnl?: string;
    action?: string;
  };
  /** 情绪状态 */
  mood?: string;
  /** 关联的早前条目时间戳（用于追溯成长） */
  references?: string[];
}

/**
 * Yaya 成长日记管理器
 *
 * 负责持久化存储日记条目，提供读取、写入、检索功能。
 * 日记文件位于 data/yaya-journal.jsonl，每行一个 JSON 对象。
 */
export class YayaJournal {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "yaya-journal.jsonl");
  }

  /**
   * 追加一条日记
   */
  append(entry: JournalEntry): void {
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(this.filePath, line, "utf-8");
  }

  /**
   * 获取最近 N 天的日记条目
   */
  getRecent(days = 7): JournalEntry[] {
    if (!fs.existsSync(this.filePath)) return [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const content = fs.readFileSync(this.filePath, "utf-8");
    const entries: JournalEntry[] = [];

    for (const line of content.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as JournalEntry;
        if (new Date(entry.timestamp).getTime() >= cutoff) {
          entries.push(entry);
        }
      } catch {
        // 跳过损坏的行
      }
    }

    return entries;
  }

  /**
   * 获取最近的 N 条日记（不受时间限制）
   */
  getLatest(count = 20): JournalEntry[] {
    if (!fs.existsSync(this.filePath)) return [];

    const content = fs.readFileSync(this.filePath, "utf-8");
    const entries: JournalEntry[] = [];

    for (const line of content.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as JournalEntry);
      } catch {
        // 跳过损坏的行
      }
    }

    return entries.slice(-count).reverse();
  }

  /**
   * 按类型检索最近的条目
   */
  getByType(type: JournalEntryType, count = 10): JournalEntry[] {
    if (!fs.existsSync(this.filePath)) return [];

    const content = fs.readFileSync(this.filePath, "utf-8");
    const matching: JournalEntry[] = [];

    for (const line of content.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as JournalEntry;
        if (entry.type === type) {
          matching.push(entry);
        }
      } catch {
        // skip
      }
    }

    return matching.slice(-count).reverse();
  }

  /**
   * 检查今天是否已有某类型的日记
   */
  hasEntryToday(type: JournalEntryType): boolean {
    if (!fs.existsSync(this.filePath)) return false;

    const today = new Date().toISOString().slice(0, 10);
    const content = fs.readFileSync(this.filePath, "utf-8");

    for (const line of content.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as JournalEntry;
        if (
          entry.type === type &&
          entry.timestamp.startsWith(today)
        ) {
          return true;
        }
      } catch {
        // skip
      }
    }

    return false;
  }

  /**
   * 总条目数
   */
  count(): number {
    if (!fs.existsSync(this.filePath)) return 0;
    const content = fs.readFileSync(this.filePath, "utf-8").trim();
    if (!content) return 0;
    return content.split("\n").filter((l) => l.trim()).length;
  }

  /**
   * 日记文件路径
   */
  get path(): string {
    return this.filePath;
  }
}
