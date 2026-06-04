/**
 * Yaya 每日反思脚本
 *
 * 调用 DeepSeek API，让 Yaya 以第一人称进行每日反思，
 * 并将反思结果写入成长日记。
 *
 * 用法：
 *   bun run scripts/reflect.ts           # 每日反思 + 交易复盘（如果交易日）
 *   bun run scripts/reflect.ts --tweet   # 反思后发一条推文
 *
 * 建议通过 cron 每天定时运行：
 *   0 22 * * * cd /path/to/eliza && bun run scripts/reflect.ts
 */

import fs from "node:fs";
import path from "node:path";

// Bun on macOS 有 TLS 证书验证兼容性问题，此处静默跳过
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ========== 配置 ==========
const DATA_DIR = path.resolve(__dirname, "..", "data");
const JOURNAL_PATH = path.join(DATA_DIR, "yaya-journal.jsonl");

const API_KEY = process.env.OPENAI_API_KEY;
const API_BASE = process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1";
// 使用 flash 而非 pro：pro 是推理模型，reasoning_content 会消耗大量 token
const MODEL = process.env.SMALL_MODEL || "deepseek-v4-flash";

if (!API_KEY) {
  console.error("OPENAI_API_KEY is not set. Make sure .env is loaded.");
  process.exit(1);
}

// ========== 类型 ==========
interface JournalEntry {
  type: string;
  timestamp: string;
  content: string;
  topics?: string[];
  mood?: string;
}

// ========== 读取最近日记 ==========
function readRecentJournal(days = 3): JournalEntry[] {
  if (!fs.existsSync(JOURNAL_PATH)) return [];

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const content = fs.readFileSync(JOURNAL_PATH, "utf-8");
  const entries: JournalEntry[] = [];

  for (const line of content.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as JournalEntry;
      if (new Date(e.timestamp).getTime() >= cutoff) {
        entries.push(e);
      }
    } catch { /* skip */ }
  }

  return entries;
}

// ========== 写入日记 ==========
function appendJournal(entry: JournalEntry): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(JOURNAL_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

// ========== 构建反思 Prompt ==========
function buildReflectionPrompt(recentEntries: JournalEntry[], reflectionType: "daily" | "trading"): string {
  const recentText = recentEntries.length > 0
    ? recentEntries.map((e) => `- [${e.timestamp.slice(0, 10)}] (${e.type}) ${e.mood ? `[mood: ${e.mood}] ` : ""}${e.content}`).join("\n")
    : "(no recent entries)";

  if (reflectionType === "daily") {
    return `You are Yaya Xu (徐雅), a 24-year-old Chinese international student (art & design MA), living abroad for 6 years. You're independent, warm, honest about your feelings, and you speak English with a natural Chinglish flavor.

It's the end of the day. You're writing in your private journal. Write a short daily reflection (2-4 sentences, max 150 words).

Think about:
- What happened today? How do you feel?
- Did anything surprise you or change your mind?
- What made you happy, frustrated, or thoughtful?
- Any small realizations?

Your recent journal entries for context:
${recentText}

Write as Yaya, in first person. Be real — not polished, not performative. This is your PRIVATE journal. Some days are boring, some are emotional, some are just tired. That's fine. Sound like a real 24-year-old girl, not a motivational speaker.

Output format: just the reflection text, no labels, no "Dear diary".`;
  }

  // Trading review
  const isWeekday = ![0, 6].includes(new Date().getDay());
  const marketNote = isWeekday
    ? "Markets were open today."
    : "Markets were closed today (weekend). You can reflect on the past week's trading or your overall approach.";

  return `You are Yaya Xu (徐雅), a 24-year-old Chinese international student. You trade stocks seriously with a real system — daily reviews, risk management, discipline. You've been through a full bull-bear cycle.

It's time for your trading journal entry. ${marketNote}

Write 2-4 sentences (max 150 words). Consider:
- What happened in the market today? Any trades or observations?
- What did you learn or notice?
- How's your discipline holding up?
- What are you watching for next session?

Your recent journal entries:
${recentText}

Write in first person as Yaya. Professional but not cold. You can be technical about stocks but still sound like yourself. Mention specific stocks/sectors if relevant. If you didn't trade, it's okay to say you sat out. Sometimes the best trade is no trade.

Output format: just the journal entry text.`;
}

// ========== 调用 LLM ==========
async function callLLM(prompt: string): Promise<string> {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant that writes authentic journal entries in character." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ========== 主流程 ==========
async function main() {
  const shouldTweet = process.argv.includes("--tweet");
  const today = new Date().toISOString().slice(0, 10);
  const recentEntries = readRecentJournal(3);

  console.log(`📓 Yaya's Daily Reflection — ${today}`);
  console.log(`   Recent journal entries: ${recentEntries.length}`);
  console.log("");

  // 1. 每日反思
  console.log("🤔 Generating daily reflection...");
  const dailyPrompt = buildReflectionPrompt(recentEntries, "daily");
  const dailyContent = await callLLM(dailyPrompt);

  const dailyEntry: JournalEntry = {
    type: "daily_reflection",
    timestamp: new Date().toISOString(),
    content: dailyContent,
    topics: extractTopics(dailyContent),
    mood: detectMood(dailyContent),
  };

  appendJournal(dailyEntry);
  console.log(`   ✓ Saved: ${dailyContent.slice(0, 80)}...`);

  // 2. 股票复盘（仅工作日 + 今天还没写）
  const isWeekday = ![0, 6].includes(new Date().getDay());
  const hasTradingReview = recentEntries.some(
    (e) => e.type === "trading_review" && e.timestamp.startsWith(today),
  );

  if (isWeekday && !hasTradingReview) {
    console.log("📈 Generating trading review...");
    const tradingPrompt = buildReflectionPrompt(recentEntries, "trading");
    const tradingContent = await callLLM(tradingPrompt);

    const tradingEntry: JournalEntry = {
      type: "trading_review",
      timestamp: new Date().toISOString(),
      content: tradingContent,
      topics: extractTopics(tradingContent),
      mood: detectMood(tradingContent),
    };

    appendJournal(tradingEntry);
    console.log(`   ✓ Saved: ${tradingContent.slice(0, 80)}...`);
  } else if (!isWeekday) {
    console.log("   ⏭  Skipping trading review (weekend)");
  } else {
    console.log("   ⏭  Trading review already exists for today");
  }

  // 3. 可选：生成推文
  if (shouldTweet) {
    console.log("🐦 Generating reflective tweet...");
    const tweetContent = await generateTweet(dailyContent);
    console.log(`   Tweet draft: ${tweetContent}`);
    console.log("   (Post manually or set up auto-posting)");
  }

  console.log("");
  console.log(`✅ Done! Journal: ${JOURNAL_PATH}`);
}

// ========== 辅助函数 ==========
function extractTopics(text: string): string[] {
  const topicKeywords: Record<string, string[]> = {
    trading: ["market", "stock", "trade", "position", "chart"],
    school: ["class", "professor", "design", "project", "critique", "homework"],
    family: ["mom", "dad", "parent", "family"],
    chengdu: ["chengdu", "成都", "hometown"],
    friends: ["friend", "party", "social", "girl"],
    life: ["life", "day", "week", "month", "year"],
    money: ["money", "rent", "bill", "expensive", "cheap"],
    "justin bieber": ["bieber", "jb", "music", "concert", "song"],
    "personal growth": ["learn", "growth", "change", "better", "realize"],
  };

  const topics: string[] = [];
  const lower = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((k) => lower.includes(k))) {
      topics.push(topic);
    }
  }
  return topics;
}

function detectMood(text: string): string {
  const moodPatterns: Array<{ mood: string; words: string[] }> = [
    { mood: "happy", words: ["happy", "good", "great", "love", "yay", "excited", "wonderful"] },
    { mood: "tired", words: ["tired", "exhausted", "drained", "sleep", "nap", "rest"] },
    { mood: "frustrated", words: ["frustrat", "annoy", "ugh", "angry", "pissed", "mad"] },
    { mood: "calm", words: ["calm", "peace", "quiet", "okay", "fine", "steady"] },
    { mood: "anxious", words: ["anxious", "nervous", "worried", "stress", "panic", "scared"] },
    { mood: "grateful", words: ["grateful", "thankful", "blessed", "appreciate"] },
    { mood: "homesick", words: ["homesick", "miss", "home", "chengdu", "family"] },
    { mood: "proud", words: ["proud", "achieved", "accomplish", "milestone", "improve"] },
  ];

  const lower = text.toLowerCase();
  for (const { mood } of moodPatterns) {
    if (lower.includes(mood)) return mood;
  }
  return "neutral";
}

async function generateTweet(dailyContent: string): Promise<string> {
  const tweetPrompt = `You are Yaya Xu. From your journal reflection below, extract or rewrite ONE thought into a tweet (under 280 characters). Should feel like a natural Yaya tweet — casual, slightly Chinglish English, warm. If the journal is too private/personal, write something lighter that captures the same vibe.

Journal: "${dailyContent}"

Output just the tweet text.`;

  const tweet = await callLLM(tweetPrompt);
  return tweet;
}

main().catch((err) => {
  console.error("Reflection failed:", err);
  process.exit(1);
});
