import { describe, it, expect } from "vitest";
import {
  Message,
  messagesToOpenAI,
  messagesFromOpenAI,
  messagesToAnthropic,
  messagesFromAnthropic,
  messagesToGoogle,
  messagesFromGoogle,
} from "../src/message.js";

describe("Message - basic construction", () => {
  it("creates a simple user message", () => {
    const msg = new Message({ role: "user", content: "Hello" });
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
  });

  it("creates message from dict (snake_case)", () => {
    const msg = Message.fromDict({
      role: "tool",
      content: "result",
      name: "search",
      tool_call_id: "call_1",
    });
    expect(msg.role).toBe("tool");
    expect(msg.name).toBe("search");
    expect(msg.toolCallId).toBe("call_1");
  });

  it("serializes to dict", () => {
    const msg = new Message({
      role: "assistant",
      content: "Hi",
      toolCalls: [{ id: "c1", type: "function", function: { name: "fn", arguments: "{}" } }],
    });
    const d = msg.toDict();
    expect(d["role"]).toBe("assistant");
    expect(d["tool_calls"]).toBeDefined();
  });
});

describe("Message - OpenAI format", () => {
  it("round-trips a simple text message", () => {
    const original = new Message({ role: "user", content: "Hello world" });
    const openaiDict = original.toOpenAIDict()!;
    const restored = Message.fromOpenAIDict(openaiDict)!;
    expect(restored.role).toBe("user");
    expect(restored.content).toBe("Hello world");
  });

  it("converts thinking block to reasoning_content", () => {
    const msg = new Message({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "step by step reasoning" },
        { type: "text", text: "Final answer" },
      ],
    });
    const d = msg.toOpenAIDict()!;
    expect(d["reasoning_content"]).toBe("step by step reasoning");
    expect(d["content"]).toBe("Final answer");
  });

  it("restores thinking from reasoning_content", () => {
    const data = {
      role: "assistant",
      content: "Final answer",
      reasoning_content: "step by step",
    };
    const msg = Message.fromOpenAIDict(data)!;
    expect(Array.isArray(msg.content)).toBe(true);
    const blocks = msg.content as Record<string, unknown>[];
    expect(blocks[0]["type"]).toBe("thinking");
    expect(blocks[1]["type"]).toBe("text");
  });

  it("preserves tool result format", () => {
    const msg = new Message({
      role: "tool",
      content: "search results here",
      name: "web_search",
      toolCallId: "call_123",
    });
    const d = msg.toOpenAIDict()!;
    expect(d["role"]).toBe("tool");
    expect(d["name"]).toBe("web_search");
    expect(d["tool_call_id"]).toBe("call_123");
  });

  it("batch converts to/from OpenAI", () => {
    const messages = [
      new Message({ role: "system", content: "You are helpful." }),
      new Message({ role: "user", content: "Hello" }),
      new Message({ role: "assistant", content: "Hi there!" }),
    ];
    const openaiMsgs = messagesToOpenAI(messages);
    expect(openaiMsgs).toHaveLength(3);

    const restored = messagesFromOpenAI(openaiMsgs);
    expect(restored).toHaveLength(3);
    expect(restored[0].role).toBe("system");
    expect(restored[1].content).toBe("Hello");
  });
});

describe("Message - Anthropic format", () => {
  it("excludes system messages from blocks", () => {
    const msg = new Message({ role: "system", content: "You are helpful." });
    expect(msg.toAnthropicBlock()).toBeNull();
  });

  it("converts tool result to user message with tool_result block", () => {
    const msg = new Message({
      role: "tool",
      content: "42",
      toolCallId: "call_abc",
    });
    const block = msg.toAnthropicBlock()!;
    expect(block["role"]).toBe("user");
    const content = block["content"] as Record<string, unknown>[];
    expect(content[0]["type"]).toBe("tool_result");
    expect(content[0]["tool_use_id"]).toBe("call_abc");
  });

  it("converts assistant tool_calls to tool_use blocks", () => {
    const msg = new Message({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "search", arguments: '{"q":"test"}' },
        },
      ],
    });
    const block = msg.toAnthropicBlock()!;
    const content = block["content"] as Record<string, unknown>[];
    const toolUse = content.find((b) => b["type"] === "tool_use");
    expect(toolUse).toBeDefined();
    expect(toolUse!["name"]).toBe("search");
  });

  it("batch converts with system extraction", () => {
    const messages = [
      new Message({ role: "system", content: "Be helpful." }),
      new Message({ role: "user", content: "Hello" }),
      new Message({ role: "assistant", content: "Hi!" }),
    ];
    const [blocks, system] = messagesToAnthropic(messages);
    expect(system).toBe("Be helpful.");
    expect(blocks).toHaveLength(2);
  });

  it("round-trips through Anthropic format", () => {
    const messages = [
      new Message({ role: "user", content: "What is 2+2?" }),
      new Message({ role: "assistant", content: "It is 4." }),
    ];
    const [blocks, system] = messagesToAnthropic(messages);
    const restored = messagesFromAnthropic(blocks, system);
    expect(restored[0].role).toBe("user");
    expect(restored[1].role).toBe("assistant");
  });
});

describe("Message - Google format", () => {
  it("excludes system messages from parts", () => {
    const msg = new Message({ role: "system", content: "system" });
    expect(msg.toGooglePart()).toBeNull();
  });

  it("maps assistant role to model", () => {
    const msg = new Message({ role: "assistant", content: "Response" });
    const part = msg.toGooglePart()!;
    expect(part["role"]).toBe("model");
  });

  it("converts thinking to thought: true part", () => {
    const msg = new Message({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "reasoning" },
        { type: "text", text: "answer" },
      ],
    });
    const part = msg.toGooglePart()!;
    const parts = part["parts"] as Record<string, unknown>[];
    const thoughtPart = parts.find((p) => p["thought"] === true);
    expect(thoughtPart).toBeDefined();
    expect(thoughtPart!["text"]).toBe("reasoning");
  });

  it("converts tool result to function_response", () => {
    const msg = new Message({
      role: "tool",
      content: "result data",
      name: "search",
      toolCallId: "call_1",
    });
    const part = msg.toGooglePart()!;
    expect(part["role"]).toBe("user");
    const parts = part["parts"] as Record<string, unknown>[];
    const fnResp = parts[0]["function_response"] as Record<string, unknown>;
    expect(fnResp["name"]).toBe("search");
  });

  it("batch converts with system extraction", () => {
    const messages = [
      new Message({ role: "system", content: "Be concise." }),
      new Message({ role: "user", content: "Hello" }),
    ];
    const [contents, sysInst] = messagesToGoogle(messages);
    expect(sysInst).toBe("Be concise.");
    expect(contents).toHaveLength(1);
  });

  it("restores from Google format with system instruction", () => {
    const messages = [
      new Message({ role: "user", content: "Hi" }),
      new Message({ role: "assistant", content: "Hello!" }),
    ];
    const [contents, sysInst] = messagesToGoogle(messages);
    const restored = messagesFromGoogle(contents, sysInst);
    expect(restored[0].role).toBe("user");
    expect(restored[1].role).toBe("assistant");
  });
});
