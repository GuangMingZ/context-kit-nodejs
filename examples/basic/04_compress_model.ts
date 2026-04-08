/**
 * 模型压缩示例 - compressByModel。
 *
 * 演示基于 LLM 的上下文压缩：
 * - 用 LLM 对较旧的对话轮次进行摘要
 * - 保留最近 N 轮完整对话
 * - 摘要以 system 消息形式插入
 *
 * 运行方式：
 *   cd context-kit-nodejs && npm run example:compress-model
 *
 * 依赖（二选一）：
 *   npm install openai       # 使用 OpenAI
 *   npm install @anthropic-ai/sdk  # 使用 Anthropic
 *
 * 环境变量（在项目根目录创建 .env 文件）：
 *   cp .env.example .env
 *   # 填入 OPENAI_API_KEY 或 ANTHROPIC_API_KEY
 */

import "dotenv/config";
import { Context, fromOpenAI, fromAnthropic } from "../../src/index.js";
import type { LLMCallable } from "../../src/index.js";
import { printHeader, printInfo, printSection } from "../util.js";

/** 创建一段较长的对话，用于演示摘要压缩效果。 */
function createLongConversation(): Record<string, unknown>[] {
  return [
    { role: "system", content: "You are a helpful coding assistant." },
    { role: "user", content: "I want to build a web scraper in TypeScript." },
    {
      role: "assistant",
      content:
        "Great! I recommend using axios for HTTP requests and cheerio for HTML parsing, similar to jQuery's API.",
    },
    { role: "user", content: "How do I handle rate limiting?" },
    {
      role: "assistant",
      content:
        "Use setTimeout between requests, typically 1-2 seconds. You can also use a library like p-limit to control concurrency.",
    },
    { role: "user", content: "What about JavaScript-rendered pages?" },
    {
      role: "assistant",
      content:
        "For JS-heavy sites, use Playwright or Puppeteer. They drive a real browser to execute JavaScript before scraping.",
    },
    { role: "user", content: "Can you show me a simple example?" },
    {
      role: "assistant",
      content:
        "Here's a basic example:\n```typescript\nimport axios from 'axios';\nimport * as cheerio from 'cheerio';\n\nconst { data } = await axios.get('https://example.com');\nconst $ = cheerio.load(data);\nconsole.log($('title').text());\n```",
    },
    { role: "user", content: "How do I extract all links?" },
    {
      role: "assistant",
      content:
        "Use: const links = $('a[href]').map((_, el) => $(el).attr('href')).get();",
    },
    { role: "user", content: "Now I want to save the data to a database." },
  ];
}

/** 创建一个 mock LLM，不调用真实 API，用于本地演示。 */
function createMockLlm(): LLMCallable {
  return async (prompt: string): Promise<string> => {
    // 提取对话轮数作为摘要内容
    const lines = prompt.split("\n").filter((l) => l.startsWith("user:") || l.startsWith("assistant:"));
    return (
      `[Mock Summary] Discussed: web scraping with TypeScript using axios/cheerio, ` +
      `rate limiting strategies, Playwright for JS-rendered pages, and code examples. ` +
      `(${lines.length} turns summarized)`
    );
  };
}

async function main(): Promise<void> {
  printHeader("compressByModel Demo");

  const messages = createLongConversation();
  const ctx = Context.fromOpenAI(messages);

  printSection("Original Context");
  printInfo(`Messages: ${ctx.length}, Tokens: ~${ctx.estimateTokens()}`);
  ctx.displayTokenBreakdown(8000);

  // 尝试使用真实 LLM，若环境变量未设置则降级为 mock
  let llm: LLMCallable;
  let llmName: string;

  if (process.env["OPENAI_API_KEY"]) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      baseURL: process.env["OPENAI_BASE_URL"],
    });
    llm = fromOpenAI(client as any, "gpt-4o-mini");
    llmName = `gpt-4o-mini (OpenAI${process.env["OPENAI_BASE_URL"] ? `, base: ${process.env["OPENAI_BASE_URL"]}` : ""})`;
  } else if (process.env["ANTHROPIC_API_KEY"]) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({
      baseURL: process.env["ANTHROPIC_BASE_URL"],
    });
    llm = fromAnthropic(client as any, "claude-3-haiku-20240307");
    llmName = `claude-3-haiku (Anthropic${process.env["ANTHROPIC_BASE_URL"] ? `, base: ${process.env["ANTHROPIC_BASE_URL"]}` : ""})`;
  } else {
    llm = createMockLlm();
    llmName = "Mock LLM (set OPENAI_API_KEY or ANTHROPIC_API_KEY to use real LLM)";
  }

  printSection(`Compressing with LLM...`);
  printInfo(`Using: ${llmName}`);

  try {
    const compressed = await ctx.compressByModel(llm, { keepRecent: 2 });

    printSection("Compressed Context");
    printInfo(`Messages: ${compressed.length}, Tokens: ~${compressed.estimateTokens()}`);
    compressed.displayTokenBreakdown(8000);

    printSection("Result Messages");
    for (const msg of compressed.messages) {
      const content =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const preview = content.length > 100 ? content.slice(0, 100) + "..." : content;
      printInfo(`  [${msg.role}] ${preview}`);
    }
  } catch (e: unknown) {
    printInfo(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main();
