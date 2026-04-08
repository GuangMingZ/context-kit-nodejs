/**
 * Context 模块 - 上下文管理核心类。
 *
 * 提供的功能：
 *  - compressByRule：规则压缩（清理工具结果 / thinking 块）
 *  - compressByModel：模型压缩（LLM 摘要）
 *  - 格式转换（OpenAI、Anthropic、Google）
 */

import {
  Message,
  MessageRole,
  ContentBlock,
  messagesToOpenAI,
  messagesFromOpenAI,
  messagesToAnthropic,
  messagesFromAnthropic,
  messagesToGoogle,
  messagesFromGoogle,
} from "./message.js";
import { estimateTokens, estimateTokensByType, TokenBreakdown, totalTokens } from "./util.js";
import type { LLMCallable } from "./llm.js";

export interface CompressByRuleOptions {
  /** 保留最近 N 条工具结果，其余清除（默认 3）。 */
  keepToolUses?: number;
  /** 永远不清除的工具名称列表。 */
  excludeTools?: string[];
  /** 是否清除 thinking 块（默认 false）。 */
  clearThinking?: boolean;
  /** 保留最近 N 个含 thinking 的 assistant 轮次（默认 1）。 */
  keepThinkingTurns?: number;
  /** 若指定，将清除的内容归档到此路径对应的 memory 中。 */
  memoryPath?: string;
}

export interface CompressByModelOptions {
  /** 自定义摘要指令。 */
  instruction?: string;
  /** 保留最近 N 轮对话不做摘要（默认 3）。 */
  keepRecent?: number;
  /** 是否保留原始 system 消息（默认 true）。 */
  keepSystem?: boolean;
}

export class Context {
  messages: Message[];

  constructor(messages: Message[] = []) {
    this.messages = messages;
  }

  get length(): number {
    return this.messages.length;
  }

  toString(): string {
    return `Context(messages=${this.messages.length}, tokens~${this.estimateTokens()})`;
  }

  /** 估算当前上下文的 token 总数。 */
  estimateTokens(): number {
    return estimateTokens(this.toDict() as Record<string, unknown>[]);
  }

  /** 按内容类型分类统计 token 用量。 */
  getTokenBreakdown(imageTokens = 1000): TokenBreakdown {
    return estimateTokensByType(
      this.toDict() as Record<string, unknown>[],
      imageTokens
    );
  }

  // ─── 压缩操作 ────────────────────────────────────────────────────────────────

  /**
   * 将消息按用户轮次拆分。
   * 每遇到一条 user 消息即结束一个轮次。
   * 返回 [system 消息列表, 轮次列表]。
   */
  private splitByUserTurns(): [Message[], Message[][]] {
    const turns: Message[][] = [];
    let currentTurn: Message[] = [];
    const systemMessages: Message[] = [];

    for (const msg of this.messages) {
      if (msg.role === "system") {
        systemMessages.push(msg);
        continue;
      }
      currentTurn.push(msg);
      if (msg.role === "user") {
        turns.push(currentTurn);
        currentTurn = [];
      }
    }

    if (currentTurn.length > 0) {
      turns.push(currentTurn);
    }

    return [systemMessages, turns];
  }

  /**
   * 规则压缩，与 Claude Context Editing API 对齐。
   *
   * 清除较旧的工具结果（可选同时清除 thinking 块），
   * 替换为占位符文本；可选将清除内容归档到 memory。
   *
   * @param opts.keepToolUses - 保留最近 N 条工具结果（默认 3）
   * @param opts.excludeTools - 不清除的工具名称列表
   * @param opts.clearThinking - 是否清除 thinking 块（默认 false）
   * @param opts.keepThinkingTurns - 保留最近 N 个含 thinking 的轮次（默认 1）
   * @param opts.memoryPath - 若指定，将清除内容归档到 memory
   */
  compressByRule(opts: CompressByRuleOptions = {}): Context {
    const {
      keepToolUses = 3,
      excludeTools = [],
      clearThinking = false,
      keepThinkingTurns = 1,
      memoryPath,
    } = opts;

    if (!this.messages.length) return new Context([]);

    const resultMessages: Message[] = [];
    let clearedCount = 0;
    const archiveItems: [string, string][] = [];

    // 找出所有 tool 消息的下标，保留最近 N 条
    const toolIndices: number[] = this.messages
      .map((m, i) => (m.role === "tool" ? i : -1))
      .filter((i) => i >= 0);
    const keepIndices = new Set(
      keepToolUses > 0 ? toolIndices.slice(-keepToolUses) : []
    );

    // 找出含 thinking 的 assistant 消息下标，保留最近 N 条
    const thinkingTurnIndices: number[] = this.messages
      .map((m, i) => {
        if (m.role === "assistant" && Array.isArray(m.content)) {
          const hasThinking = (m.content as ContentBlock[]).some(
            (b) => b["type"] === "thinking"
          );
          return hasThinking ? i : -1;
        }
        return -1;
      })
      .filter((i) => i >= 0);
    const keepThinkingIndices = new Set(
      keepThinkingTurns > 0 ? thinkingTurnIndices.slice(-keepThinkingTurns) : []
    );

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];

      // 处理工具结果消息
      if (msg.role === "tool") {
        const toolName = msg.name ?? "unknown";

        if (excludeTools.includes(toolName) || keepIndices.has(i)) {
          resultMessages.push(msg);
          continue;
        }

        clearedCount++;
        const originalContent =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        let placeholder: string;
        if (memoryPath) {
          const archiveKey = `tool_${String(clearedCount).padStart(3, "0")}_${toolName}`;
          archiveItems.push([archiveKey, originalContent]);
          placeholder = `[Tool result cleared. Use memory_read('/memories/${archiveKey}.md') to retrieve.]`;
        } else {
          placeholder = "[Tool result cleared]";
        }

        resultMessages.push(
          new Message({
            role: msg.role,
            content: placeholder,
            name: msg.name,
            toolCallId: msg.toolCallId,
            metadata: { cleared: true, originalTool: toolName },
          })
        );
        continue;
      }

      // 处理 thinking 块
      if (
        clearThinking &&
        msg.role === "assistant" &&
        Array.isArray(msg.content) &&
        !keepThinkingIndices.has(i)
      ) {
        const newContent = (msg.content as ContentBlock[]).map((block) => {
          if (block["type"] === "thinking") {
            return { type: "text", text: "[Thinking cleared]" };
          }
          return block;
        });

        resultMessages.push(
          new Message({
            role: msg.role,
            content: newContent,
            name: msg.name,
            toolCallId: msg.toolCallId,
            toolCalls: msg.toolCalls,
            metadata: { ...msg.metadata, thinkingCleared: true },
          })
        );
        continue;
      }

      resultMessages.push(msg);
    }

    // 若指定了 memoryPath，将归档内容写入 memory（延迟导入以避免循环依赖）
    if (memoryPath && archiveItems.length > 0) {
      void import("./memory.js").then((mem) => {
        const config = mem.init(memoryPath);
        for (const [key, content] of archiveItems) {
          const archivePath = `/memories/${key}.md`;
          try {
            mem.create(archivePath, content, config);
          } catch {
            // 文件已存在时忽略
          }
        }
      });
    }

    return new Context(resultMessages);
  }

  /**
   * 模型压缩，使用 LLM 对较旧的对话轮次进行摘要。
   * 保留最近 keepRecent 轮完整对话，旧轮次替换为摘要 system 消息。
   */
  async compressByModel(
    llm: LLMCallable,
    opts: CompressByModelOptions = {}
  ): Promise<Context> {
    const {
      instruction = "Preserve: key decisions, unresolved issues. Discard: exploratory attempts.",
      keepRecent = 3,
      keepSystem = true,
    } = opts;

    if (!this.messages.length) return new Context([]);

    const { callLlm } = await import("./llm.js");
    const [systemMessages, turns] = this.splitByUserTurns();

    // 轮次数不超过 keepRecent 时无需压缩
    if (turns.length <= keepRecent) {
      return new Context([...this.messages]);
    }

    const oldTurns = keepRecent > 0 ? turns.slice(0, -keepRecent) : turns;
    const recentTurns = keepRecent > 0 ? turns.slice(-keepRecent) : [];

    const oldMessages = oldTurns.flat();
    const recentMessages = recentTurns.flat();

    if (!oldMessages.length) return new Context([...this.messages]);

    // 将旧消息文本拼接为待摘要内容
    const textParts: string[] = [];
    for (const msg of oldMessages) {
      if (typeof msg.content === "string") {
        textParts.push(`${msg.role}: ${msg.content}`);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content as ContentBlock[]) {
          if (block["type"] === "text") {
            textParts.push(`${msg.role}: ${block["text"] ?? ""}`);
          }
        }
      }
    }

    const prompt = `Summarize concisely.\n${instruction}\n\nConversation:\n${textParts.join(
      "\n"
    )}\n\nSummary:`;

    const summary = await callLlm(llm, prompt);

    const summaryMsg = new Message({
      role: "system",
      content: `[Previous conversation summary]\n${summary}`,
      metadata: { isSummary: true },
    });

    const result: Message[] = [];
    if (keepSystem) result.push(...systemMessages);
    result.push(summaryMsg);
    result.push(...recentMessages);

    return new Context(result);
  }

  // ─── 格式转换 ────────────────────────────────────────────────────────────────

  toOpenAI(): Record<string, unknown>[] {
    return messagesToOpenAI(this.messages);
  }

  toAnthropic(): [Record<string, unknown>[], string | null] {
    return messagesToAnthropic(this.messages);
  }

  toGoogle(): [Record<string, unknown>[], string | null] {
    return messagesToGoogle(this.messages);
  }

  toDict(): Record<string, unknown>[] {
    return this.messages.map((m) => m.toDict());
  }

  // ─── 工厂方法 ────────────────────────────────────────────────────────────────

  static fromOpenAI(messages: Record<string, unknown>[]): Context {
    return new Context(messagesFromOpenAI(messages));
  }

  static fromAnthropic(
    messages: Record<string, unknown>[],
    system?: string | null
  ): Context {
    return new Context(messagesFromAnthropic(messages, system));
  }

  static fromGoogle(
    contents: Record<string, unknown>[],
    system?: string | null
  ): Context {
    return new Context(messagesFromGoogle(contents, system));
  }

  static fromDict(messages: Record<string, unknown>[]): Context {
    return new Context(messages.map((m) => Message.fromDict(m)));
  }

  /** 不可变地添加一条消息，返回新的 Context 实例。 */
  addMessage(
    role: MessageRole,
    content?: string | ContentBlock[] | null,
    extra?: Partial<Omit<Message, "role" | "content">>
  ): Context {
    const msg = new Message({ role, content, ...extra });
    return new Context([...this.messages, msg]);
  }

  /** 将 token 用量按类型打印到控制台。 */
  displayTokenBreakdown(maxTokens: number): void {
    const bd = this.getTokenBreakdown();
    const used = totalTokens(bd);
    const pct = ((used / maxTokens) * 100).toFixed(1);
    console.log(`Context Usage: ${used} / ${maxTokens} tokens (${pct}%)`);
    if (bd.text > 0) console.log(`  text:         ${bd.text}`);
    if (bd.thinking > 0) console.log(`  thinking:     ${bd.thinking}`);
    if (bd.toolCalls > 0) console.log(`  tool_calls:   ${bd.toolCalls}`);
    if (bd.toolResults > 0) console.log(`  tool_results: ${bd.toolResults}`);
    if (bd.images > 0) console.log(`  images:       ${bd.images}`);
  }
}
