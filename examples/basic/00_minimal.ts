/**
 * 最小化示例 - 20 行掌握 Context 基础。
 *
 * 演示 Context 核心类的基本用法：
 * - 从字典消息创建 Context
 * - 估算 token 数量并展示用量
 * - 添加消息（不可变操作）
 * - 导出为不同厂商格式
 *
 * 运行方式：
 *   cd context-kit-nodejs && npm run example:minimal
 */

import { Context } from "../../src/index.js";
import { printHeader, printInfo, printSection } from "../util.js";

function main(): void {
  printHeader("Context Basics");

  // 从消息列表创建 Context
  printSection("1. Create Context");
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is context engineering?" },
    {
      role: "assistant",
      content: "Context engineering is the practice of managing LLM context windows.",
    },
  ];
  let ctx = Context.fromDict(messages);
  printInfo(`Created: ${ctx.length} messages, ~${ctx.estimateTokens()} tokens`);

  // 展示 token 用量分布
  printSection("2. Display Token Usage");
  ctx.displayTokenBreakdown(4000);

  // 添加消息（不可变操作，返回新的 Context 实例）
  printSection("3. Add Message");
  ctx = ctx.addMessage("user", "Tell me more.");
  printInfo(`After add: ${ctx.length} messages`);

  // 导出为各厂商格式
  printSection("4. Export Formats");
  const openaiMsgs = ctx.toOpenAI();
  const [anthropicMsgs, system] = ctx.toAnthropic();
  const [googleContents] = ctx.toGoogle();
  printInfo(`OpenAI:    ${openaiMsgs.length} messages`);
  printInfo(`Anthropic: ${anthropicMsgs.length} messages, system='${String(system).slice(0, 30)}...'`);
  printInfo(`Google:    ${googleContents.length} contents`);
}

main();
