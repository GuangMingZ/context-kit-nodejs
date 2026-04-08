import { describe, it, expect } from "vitest";
import { Context } from "../src/context.js";

function makeMessages() {
  return [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Step 1 query" },
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "search", arguments: '{"q":"a"}' } }] },
    { role: "tool", name: "search", content: "Result 1", tool_call_id: "c1" },
    { role: "user", content: "Step 2 query" },
    { role: "assistant", content: "", tool_calls: [{ id: "c2", type: "function", function: { name: "search", arguments: '{"q":"b"}' } }] },
    { role: "tool", name: "search", content: "Result 2", tool_call_id: "c2" },
    { role: "user", content: "Step 3 query" },
    { role: "assistant", content: "", tool_calls: [{ id: "c3", type: "function", function: { name: "search", arguments: '{"q":"c"}' } }] },
    { role: "tool", name: "search", content: "Result 3", tool_call_id: "c3" },
    { role: "user", content: "Step 4 query" },
    { role: "assistant", content: "", tool_calls: [{ id: "c4", type: "function", function: { name: "read_file", arguments: '{"path":"x.py"}' } }] },
    { role: "tool", name: "read_file", content: "File content here", tool_call_id: "c4" },
    { role: "user", content: "Final question" },
    { role: "assistant", content: "Final answer" },
  ];
}

describe("Context - creation", () => {
  it("creates context from OpenAI messages", () => {
    const ctx = Context.fromOpenAI(makeMessages());
    expect(ctx.length).toBeGreaterThan(0);
  });

  it("creates context from dict", () => {
    const msgs = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const ctx = Context.fromDict(msgs);
    expect(ctx.length).toBe(2);
  });

  it("addMessage returns new context without mutating original", () => {
    const ctx = Context.fromDict([{ role: "user", content: "Hello" }]);
    const ctx2 = ctx.addMessage("assistant", "Hi!");
    expect(ctx.length).toBe(1);
    expect(ctx2.length).toBe(2);
  });

  it("exports to OpenAI format", () => {
    const msgs = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const ctx = Context.fromOpenAI(msgs);
    const out = ctx.toOpenAI();
    expect(out).toHaveLength(2);
    expect(out[0]["role"]).toBe("user");
  });

  it("exports to Anthropic format with system extraction", () => {
    const msgs = [
      { role: "system", content: "Be helpful." },
      { role: "user", content: "Hello" },
    ];
    const ctx = Context.fromOpenAI(msgs);
    const [blocks, system] = ctx.toAnthropic();
    expect(system).toBe("Be helpful.");
    expect(blocks).toHaveLength(1);
  });

  it("exports to Google format", () => {
    const msgs = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];
    const ctx = Context.fromOpenAI(msgs);
    const [contents, sysInst] = ctx.toGoogle();
    expect(sysInst).toBeNull();
    expect(contents).toHaveLength(2);
  });

  it("estimates tokens", () => {
    const ctx = Context.fromOpenAI([{ role: "user", content: "Hello world" }]);
    expect(ctx.estimateTokens()).toBeGreaterThan(0);
  });
});

describe("Context - compressByRule", () => {
  it("clears old tool results keeping most recent", () => {
    const ctx = Context.fromOpenAI(makeMessages());
    const compressed = ctx.compressByRule({ keepToolUses: 2 });

    const toolMsgs = compressed.messages.filter((m) => m.role === "tool");
    const cleared = toolMsgs.filter(
      (m) => m.content === "[Tool result cleared]"
    );
    const kept = toolMsgs.filter(
      (m) => m.content !== "[Tool result cleared]"
    );
    expect(kept).toHaveLength(2);
    expect(cleared).toHaveLength(toolMsgs.length - 2);
  });

  it("keeps all tool results when keepToolUses >= total", () => {
    const ctx = Context.fromOpenAI(makeMessages());
    const toolCount = ctx.messages.filter((m) => m.role === "tool").length;
    const compressed = ctx.compressByRule({ keepToolUses: toolCount + 5 });
    const cleared = compressed.messages.filter(
      (m) => m.role === "tool" && m.content === "[Tool result cleared]"
    );
    expect(cleared).toHaveLength(0);
  });

  it("respects excludeTools", () => {
    const ctx = Context.fromOpenAI(makeMessages());
    const compressed = ctx.compressByRule({
      keepToolUses: 1,
      excludeTools: ["read_file"],
    });
    const readFileMsg = compressed.messages.find(
      (m) => m.role === "tool" && m.name === "read_file"
    );
    expect(readFileMsg?.content).toBe("File content here");
  });

  it("clears thinking blocks when clearThinking is true", () => {
    const messagesWithThinking = [
      { role: "system", content: "System" },
      { role: "user", content: "Q1" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "old reasoning" },
          { type: "text", text: "A1" },
        ],
      },
      { role: "user", content: "Q2" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "recent reasoning" },
          { type: "text", text: "A2" },
        ],
      },
    ];
    const ctx = Context.fromDict(messagesWithThinking);
    const compressed = ctx.compressByRule({
      clearThinking: true,
      keepThinkingTurns: 1,
    });

    const firstAssistant = compressed.messages[2];
    const firstContent = firstAssistant.content as Record<string, unknown>[];
    const firstBlock = firstContent.find((b) => b["type"] === "thinking" || (b["type"] === "text" && b["text"] === "[Thinking cleared]"));
    expect(firstBlock?.["text"]).toBe("[Thinking cleared]");

    const lastAssistant = compressed.messages[4];
    const lastContent = lastAssistant.content as Record<string, unknown>[];
    const thinkingBlock = lastContent.find((b) => b["type"] === "thinking");
    expect(thinkingBlock).toBeDefined();
    expect(thinkingBlock?.["thinking"]).toBe("recent reasoning");
  });

  it("adds memory archive placeholder when memoryPath is set", () => {
    const ctx = Context.fromOpenAI(makeMessages());
    const compressed = ctx.compressByRule({
      keepToolUses: 1,
      memoryPath: "/tmp/test_memory_archive",
    });
    const clearedMsgs = compressed.messages.filter(
      (m) =>
        m.role === "tool" &&
        typeof m.content === "string" &&
        m.content.includes("memory_read")
    );
    expect(clearedMsgs.length).toBeGreaterThan(0);
  });

  it("does not mutate original context", () => {
    const ctx = Context.fromOpenAI(makeMessages());
    const originalLength = ctx.length;
    ctx.compressByRule({ keepToolUses: 1 });
    expect(ctx.length).toBe(originalLength);
  });

  it("handles empty context", () => {
    const ctx = new Context([]);
    const compressed = ctx.compressByRule();
    expect(compressed.length).toBe(0);
  });
});

describe("Context - compressByModel", () => {
  it("summarizes old turns using LLM", async () => {
    const ctx = Context.fromDict([
      { role: "system", content: "System prompt" },
      { role: "user", content: "Turn 1 question" },
      { role: "assistant", content: "Turn 1 answer" },
      { role: "user", content: "Turn 2 question" },
      { role: "assistant", content: "Turn 2 answer" },
      { role: "user", content: "Turn 3 question" },
      { role: "assistant", content: "Turn 3 answer" },
      { role: "user", content: "Recent question" },
      { role: "assistant", content: "Recent answer" },
    ]);

    const mockLlm = async (_prompt: string) =>
      "Summary of earlier turns: T1 and T2 discussed X.";

    const compressed = await ctx.compressByModel(mockLlm, { keepRecent: 2 });

    const summaryMsg = compressed.messages.find(
      (m) =>
        m.role === "system" &&
        typeof m.content === "string" &&
        m.content.includes("[Previous conversation summary]")
    );
    expect(summaryMsg).toBeDefined();
  });

  it("keeps recent turns intact", async () => {
    const ctx = Context.fromDict([
      { role: "user", content: "Old 1" },
      { role: "assistant", content: "Old ans 1" },
      { role: "user", content: "Old 2" },
      { role: "assistant", content: "Old ans 2" },
      { role: "user", content: "Recent question" },
      { role: "assistant", content: "Recent answer" },
    ]);

    const mockLlm = async () => "Summary of old turns.";
    // keepRecent: 2 keeps the last two turns: [Old ans 2 + Recent question] and [Recent answer]
    const compressed = await ctx.compressByModel(mockLlm, { keepRecent: 2 });

    const recentMsg = compressed.messages.find(
      (m) => m.role === "user" && m.content === "Recent question"
    );
    expect(recentMsg).toBeDefined();
  });

  it("returns original if not enough turns to compress", async () => {
    const ctx = Context.fromDict([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ]);
    const mockLlm = async () => "summary";
    const compressed = await ctx.compressByModel(mockLlm, { keepRecent: 3 });
    expect(compressed.length).toBe(ctx.length);
  });
});

describe("Context - format round-trips", () => {
  it("round-trips through Anthropic format", () => {
    const msgs = [
      { role: "system", content: "System." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const ctx = Context.fromOpenAI(msgs);
    const [blocks, system] = ctx.toAnthropic();
    const restored = Context.fromAnthropic(blocks, system);
    expect(restored.messages[0].role).toBe("system");
    const userMsg = restored.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("Hello");
  });

  it("round-trips through Google format", () => {
    const msgs = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const ctx = Context.fromOpenAI(msgs);
    const [contents, sysInst] = ctx.toGoogle();
    const restored = Context.fromGoogle(contents, sysInst);
    expect(restored.messages.some((m) => m.role === "user")).toBe(true);
    expect(restored.messages.some((m) => m.role === "assistant")).toBe(true);
  });
});
