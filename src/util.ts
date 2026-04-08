/**
 * context-kit 工具函数。
 */

export type MessageDict = Record<string, unknown>;

/**
 * Token 用量按内容类型的分类统计。
 */
export interface TokenBreakdown {
  text: number;        // 普通文本
  thinking: number;    // 思考块（thinking block）
  toolCalls: number;   // 工具调用
  toolResults: number; // 工具结果
  images: number;      // 图片
}

export function totalTokens(bd: TokenBreakdown): number {
  return bd.text + bd.thinking + bd.toolCalls + bd.toolResults + bd.images;
}

export function tokenBreakdownAsDict(bd: TokenBreakdown): Record<string, number> {
  return {
    text: bd.text,
    thinking: bd.thinking,
    toolCalls: bd.toolCalls,
    toolResults: bd.toolResults,
    images: bd.images,
    total: totalTokens(bd),
  };
}

/** 基于字符数估算 token（约 4 字符/token）。 */
function charBasedEstimate(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

/** 将消息列表中的所有文本内容拼接为单一字符串，用于 token 估算。 */
function extractText(messages: MessageDict[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    const content = msg["content"];
    if (typeof content === "string") {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>)["type"] === "text"
        ) {
          parts.push(String((block as Record<string, unknown>)["text"] ?? ""));
        }
      }
    }
    const toolCalls = msg["tool_calls"];
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        parts.push(JSON.stringify(tc));
      }
    }
  }
  return parts.join("\n");
}

/**
 * 估算消息列表或原始字符串的 token 数量。
 * 使用约 4 字符/token 的启发式规则，无需外部依赖。
 */
export function estimateTokens(
  messages: MessageDict[] | string,
  _method: "char" = "char"
): number {
  const text = typeof messages === "string" ? messages : extractText(messages);
  return charBasedEstimate(text);
}

function estimateSingle(text: string): number {
  if (!text) return 0;
  return charBasedEstimate(text);
}

/**
 * 按内容类型分类估算 token 用量。
 * 分类包括：text、thinking、toolCalls、toolResults、images。
 */
export function estimateTokensByType(
  messages: MessageDict[],
  imageTokens = 1000
): TokenBreakdown {
  const bd: TokenBreakdown = {
    text: 0,
    thinking: 0,
    toolCalls: 0,
    toolResults: 0,
    images: 0,
  };

  for (const msg of messages) {
    const role = msg["role"];
    const content = msg["content"];

    // 工具结果消息单独统计
    if (role === "tool") {
      if (typeof content === "string") {
        bd.toolResults += estimateSingle(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b["type"] === "text") {
            bd.toolResults += estimateSingle(String(b["text"] ?? ""));
          }
        }
      }
      continue;
    }

    // 普通内容：按块类型分类计数
    if (typeof content === "string") {
      bd.text += estimateSingle(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        const b = block as Record<string, unknown>;
        const blockType = b["type"];
        if (blockType === "text") {
          bd.text += estimateSingle(String(b["text"] ?? ""));
        } else if (blockType === "thinking") {
          bd.thinking += estimateSingle(String(b["thinking"] ?? ""));
        } else if (blockType === "image" || blockType === "image_url") {
          bd.images += imageTokens;
        }
      }
    }

    // assistant 消息的 tool_calls 统计
    const toolCalls = msg["tool_calls"];
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        bd.toolCalls += estimateSingle(JSON.stringify(tc));
      }
    }
  }

  return bd;
}
