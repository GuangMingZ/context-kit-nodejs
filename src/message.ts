/**
 * Message 模块 - 消息类及多厂商格式互转。
 *
 * 支持的格式：
 *  - OpenAI：标准 chat completion 格式
 *  - Anthropic：Claude API 格式（system 单独传递，tool_use/tool_result 块）
 *  - Google：Gemini API 格式（model 角色，function_call/function_response parts）
 */

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ContentBlock = Record<string, unknown>;

export interface MessageData {
  role: MessageRole;
  content?: string | ContentBlock[] | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

export class Message {
  role: MessageRole;
  content: string | ContentBlock[] | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: Record<string, unknown>[];
  metadata: Record<string, unknown>;

  constructor(data: MessageData) {
    this.role = data.role;
    this.content = data.content ?? null;
    this.name = data.name;
    this.toolCallId = data.toolCallId;
    this.toolCalls = data.toolCalls;
    this.metadata = data.metadata ?? {};
  }

  toDict(): Record<string, unknown> {
    const result: Record<string, unknown> = { role: this.role };
    if (this.content !== null && this.content !== undefined) result["content"] = this.content;
    if (this.name !== undefined) result["name"] = this.name;
    if (this.toolCallId !== undefined) result["tool_call_id"] = this.toolCallId;
    if (this.toolCalls !== undefined) result["tool_calls"] = this.toolCalls;
    if (Object.keys(this.metadata).length > 0) result["metadata"] = this.metadata;
    return result;
  }

  static fromDict(data: Record<string, unknown>): Message {
    return new Message({
      role: (data["role"] as MessageRole) ?? "user",
      content: (data["content"] as string | ContentBlock[] | null) ?? null,
      name: data["name"] as string | undefined,
      toolCallId: (data["tool_call_id"] ?? data["toolCallId"]) as string | undefined,
      toolCalls: data["tool_calls"] as Record<string, unknown>[] | undefined,
      metadata: (data["metadata"] as Record<string, unknown>) ?? {},
    });
  }

  // ─── OpenAI 格式 ─────────────────────────────────────────────────────────────

  toOpenAIDict(): Record<string, unknown> | null {
    if (!this.role) return null;

    const result: Record<string, unknown> = { role: this.role };

    if (this.content !== null && this.content !== undefined) {
      if (typeof this.content === "string") {
        result["content"] = this.content;
      } else if (Array.isArray(this.content)) {
        const openaiContent: ContentBlock[] = [];
        const thinkingParts: string[] = [];

        for (const block of this.content) {
          const blockType = block["type"] as string;
          if (blockType === "text") {
            openaiContent.push({ type: "text", text: block["text"] ?? "" });
          } else if (blockType === "image_url") {
            openaiContent.push({ type: "image_url", image_url: block["image_url"] ?? {} });
          } else if (blockType === "thinking") {
            // thinking 块转换为 reasoning_content（兼容 DeepSeek R1 / OpenAI o1）
            const thinking = block["thinking"] as string;
            if (thinking) thinkingParts.push(thinking);
          } else {
            openaiContent.push(block);
          }
        }

        if (thinkingParts.length > 0) {
          result["reasoning_content"] = thinkingParts.join("\n\n");
        }

        // 只有一个文本块时简化为字符串
        if (openaiContent.length === 1 && openaiContent[0]["type"] === "text") {
          result["content"] = openaiContent[0]["text"] ?? "";
        } else if (openaiContent.length > 0) {
          result["content"] = openaiContent;
        } else {
          result["content"] = null;
        }
      }
    }

    if (this.toolCalls) result["tool_calls"] = this.toolCalls;

    if (this.role === "tool") {
      if (this.name) result["name"] = this.name;
      if (this.toolCallId) result["tool_call_id"] = this.toolCallId;
    }

    return result;
  }

  static fromOpenAIDict(data: Record<string, unknown>): Message | null {
    const role = data["role"] as MessageRole;
    if (!role) return null;

    const content = data["content"];
    const reasoningContent = data["reasoning_content"] as string | undefined; // DeepSeek R1 / o1
    const blocks: ContentBlock[] = [];

    if (reasoningContent) {
      blocks.push({ type: "thinking", thinking: reasoningContent });
    }

    let internalContent: string | ContentBlock[] | null = null;

    if (content !== null && content !== undefined) {
      if (typeof content === "string") {
        if (blocks.length > 0) {
          // 将 reasoning_content 与正文合并为块列表
          blocks.push({ type: "text", text: content });
        } else {
          internalContent = content;
        }
      } else if (Array.isArray(content)) {
        for (const block of content as ContentBlock[]) {
          const blockType = block["type"] as string;
          if (blockType === "text") {
            blocks.push({ type: "text", text: block["text"] ?? "" });
          } else if (blockType === "image_url") {
            blocks.push({ type: "image_url", image_url: block["image_url"] ?? {} });
          } else if (blockType === "thinking") {
            blocks.push({ type: "thinking", thinking: block["thinking"] ?? "" });
          } else {
            blocks.push(block);
          }
        }
      }
    }

    if (blocks.length > 0) internalContent = blocks;

    return new Message({
      role,
      content: internalContent,
      name: data["name"] as string | undefined,
      toolCallId: data["tool_call_id"] as string | undefined,
      toolCalls: data["tool_calls"] as Record<string, unknown>[] | undefined,
    });
  }

  // ─── Anthropic 格式 ──────────────────────────────────────────────────────────

  toAnthropicBlock(): Record<string, unknown> | null {
    // system 消息在 Anthropic 格式中单独传递，此处不输出
    if (!this.role || this.role === "system") return null;

    // tool 消息转换为携带 tool_result 块的 user 消息
    if (this.role === "tool") {
      const content = this.content;
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: this.toolCallId ?? "",
            content: typeof content === "string" ? content : JSON.stringify(content),
          },
        ],
      };
    }

    const result: Record<string, unknown> = { role: this.role };
    const anthropicContent: ContentBlock[] = [];

    if (this.content !== null && this.content !== undefined) {
      if (typeof this.content === "string") {
        if (this.content) anthropicContent.push({ type: "text", text: this.content });
      } else if (Array.isArray(this.content)) {
        for (const block of this.content) {
          const blockType = block["type"] as string;
          if (blockType === "text") {
            const text = block["text"] as string;
            if (text) anthropicContent.push({ type: "text", text });
          } else if (blockType === "thinking") {
            const thinking = block["thinking"] as string;
            if (thinking) anthropicContent.push({ type: "thinking", thinking });
          } else if (blockType === "image") {
            anthropicContent.push({ type: "image", source: block["source"] ?? {} });
          } else {
            anthropicContent.push(block);
          }
        }
      }
    }

    // assistant 的 tool_calls 转换为 tool_use 块
    if (this.toolCalls && this.role === "assistant") {
      for (const tc of this.toolCalls) {
        const fn = (tc["function"] as Record<string, unknown>) ?? {};
        const args = fn["arguments"];
        let parsed: unknown = {};
        if (typeof args === "string") {
          try { parsed = JSON.parse(args); } catch { parsed = { raw: args }; }
        } else {
          parsed = args ?? {};
        }
        anthropicContent.push({
          type: "tool_use",
          id: tc["id"] ?? "",
          name: fn["name"] ?? "",
          input: parsed,
        });
      }
    }

    result["content"] = anthropicContent.length > 0 ? anthropicContent : "";
    return result;
  }

  static fromAnthropicBlock(data: Record<string, unknown>): Message | null {
    const role = data["role"] as MessageRole;
    if (!role) return null;

    const content = data["content"];
    if (content === null || content === undefined) return new Message({ role });
    if (typeof content === "string") return new Message({ role, content });

    const internalContent: ContentBlock[] = [];
    const toolCalls: Record<string, unknown>[] = [];

    for (const block of content as ContentBlock[]) {
      const blockType = block["type"] as string;
      if (blockType === "text") {
        internalContent.push({ type: "text", text: block["text"] ?? "" });
      } else if (blockType === "thinking") {
        internalContent.push({ type: "thinking", thinking: block["thinking"] ?? "" });
      } else if (blockType === "tool_use") {
        // tool_use 块转换为 OpenAI 风格的 tool_calls
        toolCalls.push({
          id: block["id"] ?? "",
          type: "function",
          function: {
            name: block["name"] ?? "",
            arguments: JSON.stringify(block["input"] ?? {}),
          },
        });
      } else if (blockType === "tool_result") {
        internalContent.push({
          type: "text",
          text: `[Tool Result: ${block["content"] ?? ""}]`,
        });
      } else if (blockType === "image") {
        internalContent.push({ type: "image", source: block["source"] ?? {} });
      } else {
        internalContent.push(block);
      }
    }

    // 只有一个文本块时简化为字符串
    let finalContent: string | ContentBlock[] | null = null;
    if (internalContent.length === 1 && internalContent[0]["type"] === "text") {
      finalContent = internalContent[0]["text"] as string;
    } else if (internalContent.length > 0) {
      finalContent = internalContent;
    }

    return new Message({
      role,
      content: finalContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  }

  // ─── Google / Gemini 格式 ────────────────────────────────────────────────────

  toGooglePart(): Record<string, unknown> | null {
    // system 消息在 Google 格式中作为 system_instruction 单独传递
    if (!this.role || this.role === "system") return null;

    // Google 格式中 assistant 对应 model 角色
    const googleRole = this.role === "assistant" ? "model" : "user";

    // tool 消息转换为带 function_response 的 user 消息
    if (this.role === "tool") {
      const fnResponse: Record<string, unknown> = {
        name: this.name ?? "unknown",
        response: { result: this.content },
      };
      if (this.toolCallId) fnResponse["id"] = this.toolCallId;
      return { role: "user", parts: [{ function_response: fnResponse }] };
    }

    const parts: ContentBlock[] = [];

    if (this.content !== null && this.content !== undefined) {
      if (typeof this.content === "string") {
        if (this.content) parts.push({ text: this.content });
      } else if (Array.isArray(this.content)) {
        for (const block of this.content) {
          const blockType = block["type"] as string;
          if (blockType === "text") {
            const text = block["text"] as string;
            if (text) parts.push({ text });
          } else if (blockType === "thinking") {
            // thinking 块以 thought: true 标记输出
            const thinking = block["thinking"] as string;
            if (thinking) parts.push({ text: thinking, thought: true });
          } else if (blockType === "image") {
            const source = (block["source"] as Record<string, unknown>) ?? {};
            parts.push({
              inline_data: {
                mime_type: source["media_type"] ?? "image/png",
                data: source["data"] ?? "",
              },
            });
          } else if (blockType === "image_url") {
            const url = ((block["image_url"] as Record<string, unknown>)?.["url"]) ?? "";
            parts.push({ text: `[Image: ${url}]` });
          } else {
            parts.push({ text: String(block) });
          }
        }
      }
    }

    // tool_calls 转换为 function_call parts
    if (this.toolCalls && this.role === "assistant") {
      for (const tc of this.toolCalls) {
        const fn = (tc["function"] as Record<string, unknown>) ?? {};
        const argsStr = fn["arguments"];
        let args: unknown = {};
        if (typeof argsStr === "string") {
          try { args = JSON.parse(argsStr); } catch { args = { raw: argsStr }; }
        } else {
          args = argsStr ?? {};
        }
        const fc: Record<string, unknown> = {
          name: fn["name"] ?? "",
          args,
        };
        if (tc["id"]) fc["id"] = tc["id"];
        parts.push({ function_call: fc });
      }
    }

    return parts.length > 0 ? { role: googleRole, parts } : null;
  }

  static fromGooglePart(data: Record<string, unknown>): Message | null {
    const role = data["role"] as string;
    if (!role) return null;

    // model 角色映射为 assistant
    const internalRole: MessageRole = role === "model" ? "assistant" : "user";
    const parts = (data["parts"] as ContentBlock[]) ?? [];
    if (!parts.length) return new Message({ role: internalRole, content: "" });

    const internalContent: ContentBlock[] = [];
    const toolCalls: Record<string, unknown>[] = [];

    for (const part of parts) {
      if ("text" in part) {
        // thought: true 标记的块视为 thinking
        if (part["thought"]) {
          internalContent.push({ type: "thinking", thinking: part["text"] });
        } else {
          internalContent.push({ type: "text", text: part["text"] });
        }
      } else if ("function_call" in part) {
        const fc = part["function_call"] as Record<string, unknown>;
        const toolCallId = (fc["id"] as string) ?? `call_${fc["name"] ?? "unknown"}`;
        toolCalls.push({
          id: toolCallId,
          type: "function",
          function: {
            name: fc["name"] ?? "",
            arguments: JSON.stringify(fc["args"] ?? {}),
          },
        });
      } else if ("function_response" in part) {
        const fr = part["function_response"] as Record<string, unknown>;
        const response = (fr["response"] as Record<string, unknown>) ?? {};
        const result = "result" in response ? response["result"] : String(response);
        internalContent.push({
          type: "text",
          text: `[Function Response: ${fr["name"] ?? "unknown"}] ${result}`,
        });
      } else if ("inline_data" in part) {
        const inline = part["inline_data"] as Record<string, unknown>;
        internalContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: inline["mime_type"] ?? "image/png",
            data: inline["data"] ?? "",
          },
        });
      }
    }

    // 只有一个文本块时简化为字符串
    let finalContent: string | ContentBlock[] | null = null;
    if (internalContent.length === 1 && internalContent[0]["type"] === "text") {
      finalContent = internalContent[0]["text"] as string;
    } else if (internalContent.length > 0) {
      finalContent = internalContent;
    }

    return new Message({
      role: internalRole,
      content: finalContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  }
}

// ─── 批量转换辅助函数 ─────────────────────────────────────────────────────────

export function messagesToOpenAI(messages: Message[]): Record<string, unknown>[] {
  return messages.flatMap((m) => {
    const d = m.toOpenAIDict();
    return d ? [d] : [];
  });
}

export function messagesFromOpenAI(data: Record<string, unknown>[]): Message[] {
  return data.flatMap((d) => {
    const m = Message.fromOpenAIDict(d);
    return m ? [m] : [];
  });
}

export function messagesToAnthropic(
  messages: Message[]
): [Record<string, unknown>[], string | null] {
  const result: Record<string, unknown>[] = [];
  const systemParts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (typeof msg.content === "string" && msg.content) {
        systemParts.push(msg.content);
      }
      continue;
    }
    const converted = msg.toAnthropicBlock();
    if (converted) result.push(converted);
  }

  // Anthropic 要求消息角色交替，合并相邻同角色消息
  const merged = mergeConsecutiveRoles(result);
  const system = systemParts.length > 0 ? systemParts.join("\n\n") : null;
  return [merged, system];
}

export function messagesFromAnthropic(
  data: Record<string, unknown>[],
  system?: string | null
): Message[] {
  const result: Message[] = [];
  if (system) result.push(new Message({ role: "system", content: system }));
  for (const d of data) {
    const m = Message.fromAnthropicBlock(d);
    if (m) result.push(m);
  }
  return result;
}

export function messagesToGoogle(
  messages: Message[]
): [Record<string, unknown>[], string | null] {
  const result: Record<string, unknown>[] = [];
  const systemParts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (typeof msg.content === "string" && msg.content) {
        systemParts.push(msg.content);
      }
      continue;
    }
    const converted = msg.toGooglePart();
    if (converted) result.push(converted);
  }

  const systemInstruction = systemParts.length > 0 ? systemParts.join("\n\n") : null;
  return [result, systemInstruction];
}

export function messagesFromGoogle(
  data: Record<string, unknown>[],
  systemInstruction?: string | null
): Message[] {
  const result: Message[] = [];
  if (systemInstruction) {
    result.push(new Message({ role: "system", content: systemInstruction }));
  }

  for (const item of data) {
    const parts = (item["parts"] as Record<string, unknown>[]) ?? [];
    const functionResponses: Record<string, unknown>[] = [];
    const otherParts: Record<string, unknown>[] = [];

    // 将 function_response 拆分为独立的 tool 消息
    for (const part of parts) {
      if ("function_response" in part) {
        functionResponses.push(
          part["function_response"] as Record<string, unknown>
        );
      } else {
        otherParts.push(part);
      }
    }

    for (const fr of functionResponses) {
      const response = (fr["response"] as Record<string, unknown>) ?? {};
      let content: string;
      if (typeof response === "object" && "result" in response) {
        const r = response["result"];
        content = typeof r === "string" ? r : JSON.stringify(r);
      } else {
        content = String(response);
      }
      result.push(
        new Message({
          role: "tool",
          content,
          name: fr["name"] as string | undefined,
          toolCallId: fr["id"] as string | undefined,
        })
      );
    }

    if (otherParts.length > 0) {
      const modified = { ...item, parts: otherParts };
      const msg = Message.fromGooglePart(modified);
      if (msg) result.push(msg);
    }
  }

  return result;
}

/**
 * 合并连续同角色消息（Anthropic 要求用户/助手角色严格交替）。
 */
function mergeConsecutiveRoles(
  messages: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (!messages.length) return [];

  const result: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;

  for (const msg of messages) {
    if (current === null) {
      current = { ...msg };
      const c = current["content"];
      if (typeof c === "string") {
        current["content"] = [{ type: "text", text: c }];
      } else if (!Array.isArray(c)) {
        current["content"] = [];
      }
      continue;
    }

    if (msg["role"] === current["role"]) {
      // 同角色：将内容合并到当前消息
      const currentContent = current["content"] as Record<string, unknown>[];
      const msgContent = msg["content"];
      if (typeof msgContent === "string") {
        currentContent.push({ type: "text", text: msgContent });
      } else if (Array.isArray(msgContent)) {
        currentContent.push(...(msgContent as Record<string, unknown>[]));
      }
      current["content"] = currentContent;
    } else {
      result.push(current);
      current = { ...msg };
      const c = current["content"];
      if (typeof c === "string") {
        current["content"] = [{ type: "text", text: c }];
      } else if (!Array.isArray(c)) {
        current["content"] = [];
      }
    }
  }

  if (current) result.push(current);
  return result;
}
