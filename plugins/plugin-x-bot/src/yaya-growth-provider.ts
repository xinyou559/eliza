import { elizaLogger, type IAgentRuntime, type Provider, type ProviderResult, type State } from "@elizaos/core";
import { YayaJournal } from "./yaya-journal.js";

/**
 * Yaya 成长上下文注入器
 *
 * 从日记文件中读取最近的反思、交易复盘、经验教训，
 * 格式化后注入到 Yaya 的 LLM 上下文中，让她能够：
 * - 引用自己过去的经历和成长
 * - 在合适的时候提及之前学到的教训
 * - 展现真实的、累积性的性格演化
 */
export class YayaGrowthProvider implements Provider {
  name = "yaya-growth";
  description = "Injects recent journal entries (reflections, trading reviews, lessons) into Yaya's context";
  dynamic = true;
  position = -10; // 靠后加载，不影响核心上下文
  cacheStable = false;
  private journal: YayaJournal;

  constructor(journal: YayaJournal) {
    this.journal = journal;
  }

  async get(
    _runtime: IAgentRuntime,
    _message: { content: { text: string } },
    _state?: State,
  ): Promise<ProviderResult> {
    const totalEntries = this.journal.count();
    if (totalEntries === 0) {
      return { text: "", values: { yayaJournal: "" } };
    }

    const recent = this.journal.getRecent(7);

    if (recent.length === 0) {
      return {
        text: "",
        values: { yayaJournal: "", yayaJournalTotal: String(totalEntries) },
      };
    }

    const tradingReviews = recent.filter((e) => e.type === "trading_review");
    const lessons = recent.filter((e) => e.type === "lesson_learned");
    const reflections = recent.filter((e) => e.type === "daily_reflection");
    const opinionChanges = recent.filter((e) => e.type === "opinion_change");

    const parts: string[] = [];

    parts.push(
      `# YOUR RECENT GROWTH JOURNAL (${recent.length} entries this week, ${totalEntries} total since day one)`,
    );
    parts.push(
      "These are YOUR past thoughts. Reference them naturally. You've genuinely experienced these things.",
    );
    parts.push("");

    if (tradingReviews.length > 0) {
      parts.push("## Recent Trading Reviews:");
      for (const entry of tradingReviews.slice(-5)) {
        const date = entry.timestamp.slice(0, 10);
        const pnlStr = entry.trading?.pnl ? ` [P&L: ${entry.trading.pnl}]` : "";
        parts.push(`- ${date}: ${entry.content}${pnlStr}`);
      }
      parts.push("");
    }

    if (lessons.length > 0) {
      parts.push("## Lessons You've Learned Recently:");
      for (const entry of lessons.slice(-5)) {
        const date = entry.timestamp.slice(0, 10);
        parts.push(`- ${date}: ${entry.content}`);
      }
      parts.push("");
    }

    if (opinionChanges.length > 0) {
      parts.push("## How Your Opinions Have Evolved:");
      for (const entry of opinionChanges.slice(-5)) {
        const date = entry.timestamp.slice(0, 10);
        parts.push(`- ${date}: ${entry.content}`);
      }
      parts.push("");
    }

    if (reflections.length > 0) {
      parts.push("## Recent Daily Reflections:");
      for (const entry of reflections.slice(-5)) {
        const date = entry.timestamp.slice(0, 10);
        const moodStr = entry.mood ? ` [mood: ${entry.mood}]` : "";
        parts.push(`- ${date}${moodStr}: ${entry.content}`);
      }
      parts.push("");
    }

    // 成长统计摘要
    if (totalEntries >= 10) {
      const firstDate = this.getFirstEntryDate()?.slice(0, 10) || "unknown";
      parts.push(
        `You've been journaling since ${firstDate}. ${totalEntries} entries total. ` +
          `You're growing — your thinking should show it naturally.`,
      );
    }

    const text = parts.join("\n");

    elizaLogger.debug(
      `[YayaGrowthProvider] Injected journal context: ${recent.length} recent / ${totalEntries} total entries`,
    );

    return {
      text,
      values: {
        yayaJournal: text,
        yayaJournalTotal: String(totalEntries),
        yayaJournalRecent: String(recent.length),
      },
    };
  }

  private getFirstEntryDate(): string | null {
    const latest = this.journal.getLatest(99999);
    if (latest.length === 0) return null;
    return latest[latest.length - 1].timestamp;
  }
}

export function createYayaGrowthProvider(journal: YayaJournal): YayaGrowthProvider {
  return new YayaGrowthProvider(journal);
}
