import { describe, it, expect } from "vitest";
import { estimateTokens, estimateTokensByType, totalTokens, tokenBreakdownAsDict } from "../src/util.js";

describe("estimateTokens", () => {
  it("estimates tokens from a string", () => {
    const tokens = estimateTokens("Hello, world!");
    expect(tokens).toBeGreaterThan(0);
  });

  it("estimates tokens from a message list", () => {
    const messages = [
      { role: "user", content: "Hello, this is a test message." },
      { role: "assistant", content: "Hi there! How can I help you?" },
    ];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("handles empty string", () => {
    const tokens = estimateTokens("");
    expect(tokens).toBe(1); // max(1, 0)
  });

  it("handles messages with content blocks", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello from a block!" }],
      },
    ];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("handles messages with tool_calls", () => {
    const messages = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "search", arguments: '{"query":"test"}' },
          },
        ],
      },
    ];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("estimateTokensByType", () => {
  it("categorizes text tokens", () => {
    const messages = [{ role: "user", content: "Hello world test." }];
    const bd = estimateTokensByType(messages);
    expect(bd.text).toBeGreaterThan(0);
    expect(bd.toolResults).toBe(0);
    expect(bd.thinking).toBe(0);
  });

  it("categorizes tool result tokens", () => {
    const messages = [
      { role: "tool", content: "Tool output here for testing purposes." },
    ];
    const bd = estimateTokensByType(messages);
    expect(bd.toolResults).toBeGreaterThan(0);
    expect(bd.text).toBe(0);
  });

  it("categorizes thinking tokens", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Let me think about this step by step." },
          { type: "text", text: "Here is my answer." },
        ],
      },
    ];
    const bd = estimateTokensByType(messages);
    expect(bd.thinking).toBeGreaterThan(0);
    expect(bd.text).toBeGreaterThan(0);
  });

  it("counts image tokens with fixed estimate", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "image", source: {} }],
      },
    ];
    const bd = estimateTokensByType(messages, 500);
    expect(bd.images).toBe(500);
  });

  it("counts tool_calls tokens", () => {
    const messages = [
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "fn", arguments: "{}" } }],
      },
    ];
    const bd = estimateTokensByType(messages);
    expect(bd.toolCalls).toBeGreaterThan(0);
  });

  it("totalTokens sums all fields", () => {
    const bd = { text: 10, thinking: 5, toolCalls: 3, toolResults: 7, images: 0 };
    expect(totalTokens(bd)).toBe(25);
  });

  it("tokenBreakdownAsDict includes total", () => {
    const bd = { text: 10, thinking: 5, toolCalls: 3, toolResults: 7, images: 0 };
    const dict = tokenBreakdownAsDict(bd);
    expect(dict["total"]).toBe(25);
    expect(dict["text"]).toBe(10);
  });
});
