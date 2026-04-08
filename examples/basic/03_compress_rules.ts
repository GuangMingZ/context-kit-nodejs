/**
 * 规则压缩示例 - compressByRule。
 *
 * 演示规则压缩（与 Claude Context Editing API 对齐）：
 * - 清除较旧的工具结果（保留最近 N 条）
 * - 可选清除 thinking 块
 * - 压缩前后对比（token 用量）
 *
 * 运行方式：
 *   cd context-kit-nodejs && npm run example:compress-rules
 */

import { Context } from "../../src/index.js";
import { printHeader, printInfo, printSection } from "../util.js";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

/** 打印消息列表，每行一条，展示角色与内容摘要。 */
function printMessages(ctx: Context, label: string): void {
  console.log(`\n${BOLD}${label}${RESET}`);
  for (let i = 0; i < ctx.messages.length; i++) {
    const msg = ctx.messages[i];
    const idx = String(i + 1).padStart(2);
    let summary = "";
    let tag = "";

    if (msg.role === "tool") {
      const content =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const cleared = msg.metadata?.["cleared"] === true;
      const preview = content.length > 55 ? content.slice(0, 55) + "…" : content;
      tag = cleared
        ? ` ${RED}[CLEARED]${RESET}`
        : ` ${GREEN}[KEPT]${RESET}`;
      summary = `[${msg.name ?? "tool"}] "${DIM}${preview}${RESET}"${tag}`;
    } else if (msg.role === "assistant" && msg.toolCalls?.length) {
      const names = msg.toolCalls
        .map((tc) => ((tc["function"] as Record<string, unknown>)?.["name"] as string) ?? "?")
        .join(", ");
      summary = `${YELLOW}[tool_call: ${names}]${RESET}`;
    } else if (typeof msg.content === "string" && msg.content) {
      const preview =
        msg.content.length > 60 ? msg.content.slice(0, 60) + "…" : msg.content;
      summary = `"${DIM}${preview}${RESET}"`;
    } else if (Array.isArray(msg.content)) {
      const parts = (msg.content as Record<string, unknown>[]).map((b) => {
        const t = b["type"] as string;
        if (t === "thinking") {
          const cleared = String(b["thinking"] ?? "").startsWith("[Thinking cleared]");
          const preview = String(b["thinking"] ?? "").slice(0, 35);
          return cleared
            ? `${RED}[thinking cleared]${RESET}`
            : `${YELLOW}[thinking: ${DIM}${preview}…${RESET}${YELLOW}]${RESET}`;
        }
        if (t === "text") {
          const preview = String(b["text"] ?? "").slice(0, 40);
          return `"${DIM}${preview}${RESET}"`;
        }
        return `[${t}]`;
      });
      summary = parts.join(" + ");
    }

    console.log(`  [${idx}] ${msg.role.padEnd(9)}: ${summary}`);
  }
}

/** 创建带有多次工具调用的示例对话（内容较大，便于演示效果）。 */
function createConversationWithTools(): Record<string, unknown>[] {
  // 模拟真实场景下的文件内容
  const configContent =
    '{"debug": true, "port": 8080, "host": "localhost", "options": ' +
    JSON.stringify(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key_${i}`, `value_${i}`]))) +
    "}";
  const grepContent = Array.from(
    { length: 20 },
    (_, i) => `file_${i}.ts:${i * 10}: try {\n  result = process();`
  ).join("\n");
  const mainContent = Array.from(
    { length: 30 },
    (_, i) => `export function function${i}() {\n  // Implementation\n}\n`
  ).join("\n");

  return [
    { role: "system", content: "You are a helpful coding assistant." },
    { role: "user", content: "Read the config file" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "read_file", arguments: '{"path": "config.json"}' },
        },
      ],
    },
    { role: "tool", content: configContent, name: "read_file", tool_call_id: "call_1" },
    { role: "assistant", content: "The config has debug=true, port=8080, host=localhost." },
    { role: "user", content: "Search for error handling code" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_2",
          type: "function",
          function: { name: "grep", arguments: '{"pattern": "try.*catch"}' },
        },
      ],
    },
    { role: "tool", content: grepContent, name: "grep", tool_call_id: "call_2" },
    { role: "assistant", content: "Found error handling in multiple files." },
    { role: "user", content: "Now read the main.ts file" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_3",
          type: "function",
          function: { name: "read_file", arguments: '{"path": "main.ts"}' },
        },
      ],
    },
    { role: "tool", content: mainContent, name: "read_file", tool_call_id: "call_3" },
    { role: "assistant", content: "Here's the main.ts content with 30 functions." },
  ];
}

/** 创建带有 thinking 块的示例对话。 */
function createConversationWithThinking(): Record<string, unknown>[] {
  const longThinking = "Let me think step by step. ".repeat(20);
  return [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is 15 * 23?" },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: longThinking + "15 * 23 = 345" },
        { type: "text", text: "15 * 23 = 345" },
      ],
    },
    { role: "user", content: "What about 87 / 3?" },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: longThinking + "87 / 3 = 29" },
        { type: "text", text: "87 / 3 = 29" },
      ],
    },
    { role: "user", content: "And sqrt(144)?" },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: longThinking + "sqrt(144) = 12" },
        { type: "text", text: "sqrt(144) = 12" },
      ],
    },
  ];
}

function main(): void {
  printHeader("compressByRule Demo");

  // Demo 1: 清除旧工具结果（压缩前后对比）
  printSection("1. Clear Old Tool Results");
  const messages = createConversationWithTools();
  let ctx = Context.fromDict(messages);

  printInfo(`Before: ${ctx.length} messages, ~${ctx.estimateTokens()} tokens`);
  ctx.displayTokenBreakdown(8000);
  printMessages(ctx, "Messages Before Compression:");

  const compressed = ctx.compressByRule({ keepToolUses: 1 });

  printInfo(`\nAfter keep_tool_uses=1: ${compressed.length} messages, ~${compressed.estimateTokens()} tokens`);
  compressed.displayTokenBreakdown(8000);
  printMessages(compressed, "Messages After Compression (keep_tool_uses=1):");

  // Demo 2: 清除 thinking 块
  printSection("2. Clear Thinking Blocks");
  const thinkingMessages = createConversationWithThinking();
  ctx = Context.fromDict(thinkingMessages);

  printInfo(`Before: ~${ctx.estimateTokens()} tokens`);
  ctx.displayTokenBreakdown(4000);
  printMessages(ctx, "Messages Before Compression:");

  const compressedThinking = ctx.compressByRule({
    keepToolUses: 10,
    clearThinking: true,
    keepThinkingTurns: 1,
  });

  printInfo(`\nAfter clear_thinking=true, keep_thinking_turns=1: ~${compressedThinking.estimateTokens()} tokens`);
  compressedThinking.displayTokenBreakdown(4000);
  printMessages(compressedThinking, "Messages After Compression (clear_thinking=true, keep_thinking_turns=1):");
}

main();
