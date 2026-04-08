# context-kit

[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**中文** | [English](README_EN.md) 

> **做最简单有效的事。**

一个轻量、框架无关的 TypeScript **上下文工程**工具库。不是另一个 Agent 框架——只有纯函数和一个 `Context` 类。

---

## 背景

> "绝大多数 AI Agent 的失败，不是模型能力的失败，而是上下文工程的失败。"

上下文是**有限资源，且边际收益递减**。随着上下文窗口被填满，模型性能会下降。context-kit 提供管理上下文的基础构建块。

| 支柱 | 目的 | 模块 |
|------|------|------|
| **Select（选择）** | 按需检索——即时拉取所需信息 | `select` |
| **Write（写入）** | 在上下文窗口之外持久化信息 | `memory` |
| **Compress（压缩）** | 在保留关键信息的前提下缩减上下文 | `Context.compressByRule`, `Context.compressByModel` |
| **Isolate（隔离）** | 将上下文分发给子 Agent | 框架层面 |

---

## 安装

```bash
# 克隆并安装
git clone <repo>
cd context-kit-nodejs
npm install

# 构建
npm run build

# 运行测试
npm test
```

---

## 示例

所有示例位于 `examples/basic/`，无需构建，直接通过 `npm run` 运行。

| 文件 | 命令 | 说明 |
|------|------|------|
| `00_minimal.ts` | `npm run example:minimal` | Context 核心用法：创建、token 统计、添加消息、格式导出 |
| `01_select_tools.ts` | `npm run example:select` | Select 工具：`listDir` → `find` → `grep` → `readFile` 渐进式检索 |
| `02_memory.ts` | `npm run example:memory` | Memory 持久化：`create`、`view`、`strReplace`、`insert`、`rename` |
| `03_compress_rules.ts` | `npm run example:compress-rules` | 规则压缩：清除旧工具结果 & thinking 块，含压缩前后消息对比 |
| `04_compress_model.ts` | `npm run example:compress-model` | 模型压缩：用 LLM 对旧对话轮次做摘要，支持 mock 模式 |

### 运行方式

```bash
cd context-kit-nodejs

# 无需任何配置，直接运行
npm run example:minimal
npm run example:select
npm run example:memory
npm run example:compress-rules

# 模型压缩示例：配置 API 密钥后运行（未配置时自动降级为 mock 模式）
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 或 ANTHROPIC_API_KEY
npm run example:compress-model
```

`04_compress_model.ts` 支持的环境变量：

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 密钥，优先使用，模型为 `gpt-4o-mini` |
| `OPENAI_BASE_URL` | OpenAI 兼容端点（如本地代理、Azure），可选 |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥，备选，模型为 `claude-3-haiku-20240307` |
| `ANTHROPIC_BASE_URL` | Anthropic 兼容端点，可选 |

---

## 快速示例

```typescript
import { Context, memory, select } from "context-kit";

// 1. 从消息数组创建上下文
const messages = [
  { role: "system", content: "You are helpful." },
  { role: "user",   content: "Hello" },
  { role: "assistant", content: "Hi there!" },
];
const ctx = Context.fromOpenAI(messages);
console.log(`Messages: ${ctx.length}, Tokens: ~${ctx.estimateTokens()}`);

// 2. 规则压缩：清除旧工具结果
const compressed = ctx.compressByRule({ keepToolUses: 3 });

// 3. 导出为不同格式
const openaiMsgs              = compressed.toOpenAI();
const [anthropicMsgs, system] = compressed.toAnthropic();
const [googleContents, sysInst] = compressed.toGoogle();
```

---

## 核心概念

### Context — 核心类

`Context` 类管理对话历史，支持压缩与格式转换：

```typescript
import { Context } from "context-kit";

// 从各种格式创建
const ctx = Context.fromOpenAI(messages);
const ctx = Context.fromAnthropic(messages, "You are helpful.");
const ctx = Context.fromGoogle(contents, "You are helpful.");
const ctx = Context.fromDict(dicts);

// 压缩
const compact = ctx.compressByRule({ keepToolUses: 3 });
const summary = await ctx.compressByModel(llm, { keepRecent: 3 });

// 导出
const openaiMsgs             = ctx.toOpenAI();
const [anthropic, system]    = ctx.toAnthropic();
const [google, sysInst]      = ctx.toGoogle();

// Token 信息
ctx.estimateTokens();
ctx.getTokenBreakdown();
ctx.displayTokenBreakdown(128000);

// 不可变地添加消息
const ctx2 = ctx.addMessage("user", "追加的问题");
```

### compressByRule — 工具结果与 Thinking 块清除

清除旧工具结果（可选同时清除 thinking 块），以缩减上下文：

```typescript
// 仅保留最近 3 条工具结果
ctx.compressByRule({ keepToolUses: 3 });

// 排除指定工具不被清除
ctx.compressByRule({ keepToolUses: 3, excludeTools: ["readFile"] });

// 同时清除 thinking 块
ctx.compressByRule({
  keepToolUses: 3,
  clearThinking: true,
  keepThinkingTurns: 1,
});

// 将清除内容归档到 memory，并附带检索提示
ctx.compressByRule({
  keepToolUses: 3,
  memoryPath: "./agent_data",
});
// 被清除的消息内容变为：
// "[Tool result cleared. Use memory_read('/memories/tool_001_grep.md') to retrieve.]"
```

### compressByModel — LLM 摘要压缩

使用 LLM 对较旧的对话轮次进行摘要：

```typescript
import { fromOpenAI } from "context-kit/llm";

const llm  = fromOpenAI(openaiClient, "gpt-4o-mini");
const ctx2 = await ctx.compressByModel(llm, {
  instruction: "保留：关键决策、未解决问题。丢弃：探索性尝试。",
  keepRecent: 3,
});
```

### Select — 即时上下文检索

渐进式披露：先获取概览，再逐步缩小范围，最后按需加载：

```typescript
import { listDir, grep, readFile } from "context-kit";

// 第一步：了解全貌（token 消耗低）
const entries = listDir("./src", { maxDepth: 2 });

// 第二步：缩小范围
const matches = grep(/def \w+/, "./src", { filePattern: "*.ts" });

// 第三步：按需加载
const content = readFile("./src/auth.ts", { startLine: 40, endLine: 60 });
```

#### explore — 组合快捷方法

```typescript
import { explore } from "context-kit";

const result = explore("./src", {
  query: "export function",
  filePattern: "*.ts",
  maxDepth: 2,
});
// result.entries — 目录列表
// result.matches — grep 结果
```

### Memory — 上下文持久化

在上下文窗口之外持久化信息（遵循 Claude Memory Tool 接口）：

```typescript
import { initMemory, view, create, strReplace, insert, deleteEntry, rename, clearAll } from "context-kit";

initMemory("./agent_data");

// 增删改查
create("/memories/notes.md", "# 分析\n\n关键发现...");
const text = view("/memories/notes.md");
strReplace("/memories/notes.md", "旧内容", "新内容");
insert("/memories/notes.md", 3, "- 新条目");
deleteEntry("/memories/old_notes.md");
rename("/memories/draft.md", "/memories/final.md");
clearAll();
```

### LLM 适配器

统一的多 LLM 提供商接口：

```typescript
import { fromOpenAI, fromAnthropic } from "context-kit";

// OpenAI
const llm = fromOpenAI(openaiClient, "gpt-4o-mini");

// Anthropic
const llm = fromAnthropic(anthropicClient, "claude-3-haiku-20240307");

// 或任意 async (prompt: string) => Promise<string> 函数
const mockLlm = async (prompt: string) => "Mock response";
```

### Tools — Agent 集成

导出工具定义，供 Agent 框架使用：

```typescript
import { getMemoryTools, getSelectTools, getAllTools } from "context-kit";

// 返回 [memoryRead, memoryWrite, memoryUpdate, memoryDelete]
const memTools = getMemoryTools("./agent_data");

// 返回 [fileList, fileSearch, fileRead]
const selTools = getSelectTools("./src");

// 两者合并
const allTools = getAllTools("./agent_data", "./src");
```

每个工具函数接受普通参数并返回 `string`，可直接插入任意框架的工具调用接口。

---

## API 参考

### `Context`

| 方法 | 说明 |
|------|------|
| `Context.fromOpenAI(msgs)` | 从 OpenAI 消息数组创建 |
| `Context.fromAnthropic(msgs, system?)` | 从 Anthropic 格式创建 |
| `Context.fromGoogle(contents, system?)` | 从 Google/Gemini 格式创建 |
| `Context.fromDict(dicts)` | 从普通对象数组创建 |
| `ctx.toOpenAI()` | 导出为 OpenAI 格式 |
| `ctx.toAnthropic()` | 导出为 Anthropic 格式（返回 `[msgs, system]`） |
| `ctx.toGoogle()` | 导出为 Google 格式（返回 `[contents, sysInst]`） |
| `ctx.compressByRule(opts)` | 规则压缩 |
| `ctx.compressByModel(llm, opts)` | LLM 摘要压缩（异步） |
| `ctx.addMessage(role, content, extra?)` | 不可变地添加消息 |
| `ctx.estimateTokens()` | 估算总 token 数（约 4 字符/token） |
| `ctx.getTokenBreakdown()` | 按类型分类的 token 统计 |
| `ctx.displayTokenBreakdown(maxTokens)` | 打印 token 用量到控制台 |

### `select`

| 函数 | 说明 |
|------|------|
| `listDir(path, opts?)` | 列出目录内容 |
| `find(path, opts?)` | 按名称/类型查找 |
| `grep(pattern, path, opts?)` | 正则搜索文件内容 |
| `readFile(path, opts?)` | 读取文件（支持行范围） |
| `explore(path, opts?)` | listDir + 可选 grep |
| `configure(opts)` | 设置全局默认值 |

### `memory`

| 函数 | 说明 |
|------|------|
| `initMemory(path)` | 初始化存储目录 |
| `view(path)` | 读取文件或列出目录 |
| `create(path, text)` | 创建新文件 |
| `strReplace(path, old, new)` | 替换唯一文本片段 |
| `insert(path, line, text)` | 在指定行插入内容 |
| `deleteEntry(path)` | 删除文件或目录 |
| `rename(old, new)` | 移动/重命名 |
| `clearAll()` | 清空所有数据 |

---

## 项目结构

```
context-kit-nodejs/
├── src/
│   ├── message.ts      # Message 类 + 多厂商格式互转
│   ├── context.ts      # Context 类，含压缩操作
│   ├── memory.ts       # Memory CRUD（Claude Memory Tool 接口）
│   ├── select.ts       # 即时文件检索（listDir/grep/readFile）
│   ├── llm.ts          # LLMCallable 类型 + OpenAI/Anthropic 适配器
│   ├── tools.ts        # Agent 工具封装
│   ├── util.ts         # Token 估算工具
│   └── index.ts        # 公共 API 导出
├── examples/
│   ├── basic/
│   │   ├── 00_minimal.ts         # 核心用法
│   │   ├── 01_select_tools.ts    # Select 渐进式检索
│   │   ├── 02_memory.ts          # Memory 持久化
│   │   ├── 03_compress_rules.ts  # 规则压缩
│   │   └── 04_compress_model.ts  # 模型压缩（需 API 密钥）
│   └── util.ts                   # 示例通用输出工具
├── tests/
│   ├── util.test.ts
│   ├── message.test.ts
│   ├── context.test.ts
│   ├── memory.test.ts
│   ├── select.test.ts
│   └── tools.test.ts
├── .env.example        # 环境变量模板
├── package.json
├── tsconfig.json
└── README.md
```

---

## 设计理念

| 原则 | 说明 |
|------|------|
| **极简** | 纯函数，轻量核心——仅依赖 Node.js 内置模块 |
| **可组合** | 各模块独立，按需组合 |
| **框架无关** | 兼容任意 Agent 框架 |
| **不可变** | Context 操作返回新实例，不在原地修改 |
| **类型安全** | 全面的 TypeScript 类型覆盖 |

---

## License

MIT
