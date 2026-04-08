/**
 * context-kit：极简、框架无关的上下文工程工具包。
 *
 * 只做最简单、有效的事情。
 *
 * 核心模块：
 *  - context：Context 类，包含压缩操作
 *  - message：Message 类，支持多格式转换（OpenAI、Anthropic、Google）
 *  - memory：上下文持久化（遵循 Claude Memory Tool 接口）
 *  - select：即时上下文检索（listDir、grep、readFile）
 *  - llm：LLM 调用接口与适配器
 *  - tools：Agent 就绪的工具函数封装
 */

export const VERSION = "0.1.0";

// Context
export { Context } from "./context.js";
export type { CompressByRuleOptions, CompressByModelOptions } from "./context.js";

// Message
export { Message } from "./message.js";
export type { MessageRole, ContentBlock, MessageData } from "./message.js";
export {
  messagesToOpenAI,
  messagesFromOpenAI,
  messagesToAnthropic,
  messagesFromAnthropic,
  messagesToGoogle,
  messagesFromGoogle,
} from "./message.js";

// Util
export {
  estimateTokens,
  estimateTokensByType,
  totalTokens,
  tokenBreakdownAsDict,
} from "./util.js";
export type { TokenBreakdown } from "./util.js";

// Memory
export * as memory from "./memory.js";
export { MemoryConfig } from "./memory.js";
export {
  init as initMemory,
  view,
  create,
  strReplace,
  insert,
  deleteEntry,
  rename,
  clearAll,
} from "./memory.js";

// Select
export * as select from "./select.js";
export { SelectConfig, configure as configureSelect } from "./select.js";
export { listDir, find, grep, readFile, explore } from "./select.js";
export type { FileEntry, GrepMatch, FileContent, ExploreResult } from "./select.js";

// LLM
export * as llm from "./llm.js";
export { callLlm, callLlmSync, fromOpenAI, fromAnthropic } from "./llm.js";
export type { LLMCallable } from "./llm.js";

// Tools
export * as tools from "./tools.js";
export { getMemoryTools, getSelectTools, getAllTools } from "./tools.js";
export type { ToolFunction } from "./tools.js";
