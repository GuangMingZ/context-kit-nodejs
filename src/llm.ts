/**
 * LLM 模块 - 统一的 LLM 调用接口。
 *
 * 定义通用的 LLMCallable 类型，并提供主流 SDK 的适配器。
 *
 * 示例：
 *   import { fromOpenAI } from "context-kit/llm";
 *
 *   const llm = fromOpenAI(client, "gpt-4o-mini");
 *   const response = await llm("Summarize this...");
 */

/** LLM 可调用类型，接受 prompt 字符串，返回同步或异步结果。 */
export type LLMCallable = (prompt: string) => string | Promise<string>;

/**
 * 调用 LLM，自动处理同步和异步两种返回形式。
 */
export async function callLlm(llm: LLMCallable, prompt: string): Promise<string> {
  const result = llm(prompt);
  if (result instanceof Promise) {
    return await result;
  }
  return result;
}

/**
 * 同步调用 LLM。若 callable 返回 Promise，则抛出 TypeError。
 */
export function callLlmSync(llm: LLMCallable, prompt: string): string {
  const result = llm(prompt);
  if (result instanceof Promise) {
    throw new TypeError(
      "LLM callable returned a Promise but sync call was requested. Use callLlm() for async callables."
    );
  }
  return result;
}

// ─── 适配器 ──────────────────────────────────────────────────────────────────

/**
 * 从 OpenAI 客户端创建 LLMCallable。
 *
 * @param client - OpenAI 客户端实例（来自 `openai` 包）
 * @param model - 模型名称，例如 "gpt-4o-mini"
 * @param systemPrompt - 可选的系统提示
 * @param extraParams - 传递给 chat.completions.create() 的额外参数
 */
export function fromOpenAI(
  client: {
    chat: {
      completions: {
        create: (opts: Record<string, unknown>) => Promise<{
          choices: Array<{ message: { content: string | null } }>;
        }>;
      };
    };
  },
  model = "gpt-4o-mini",
  systemPrompt?: string | null,
  extraParams: Record<string, unknown> = {}
): LLMCallable {
  return async (prompt: string): Promise<string> => {
    const messages: Record<string, unknown>[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const response = await client.chat.completions.create({
      model,
      messages,
      ...extraParams,
    });
    return response.choices[0]?.message?.content ?? "";
  };
}

/**
 * 从 Anthropic 客户端创建 LLMCallable。
 *
 * @param client - Anthropic 客户端实例（来自 `@anthropic-ai/sdk` 包）
 * @param model - 模型名称，例如 "claude-3-haiku-20240307"
 * @param systemPrompt - 可选的系统提示
 * @param maxTokens - 响应的最大 token 数
 * @param extraParams - 额外参数
 */
export function fromAnthropic(
  client: {
    messages: {
      create: (opts: Record<string, unknown>) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>;
    };
  },
  model = "claude-3-haiku-20240307",
  systemPrompt?: string | null,
  maxTokens = 4096,
  extraParams: Record<string, unknown> = {}
): LLMCallable {
  return async (prompt: string): Promise<string> => {
    const createOpts: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      ...extraParams,
    };
    if (systemPrompt) createOpts["system"] = systemPrompt;

    const response = await client.messages.create(createOpts);
    return response.content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("");
  };
}
