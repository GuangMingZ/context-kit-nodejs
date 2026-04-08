/**
 * Tools 模块 - Agent 就绪的工具函数。
 *
 * 将 memory 和 select 功能封装为 LLM 友好的工具函数：
 * 统一字符串返回值，内部捕获异常避免中断 Agent 循环。
 * 使用工厂函数创建绑定到具体路径的工具集。
 *
 * 示例：
 *   const memoryTools = getMemoryTools("./agent_data");
 *   const selectTools = getSelectTools("./src");
 *   const allTools = [...memoryTools, ...selectTools];
 */

import * as memory from "./memory.js";
import * as select from "./select.js";

/** Agent 工具函数类型：接受任意参数，始终返回字符串。 */
export type ToolFunction = (...args: unknown[]) => string;

/**
 * 创建绑定到指定路径的 memory 工具集。
 * 返回 [memoryRead, memoryWrite, memoryUpdate, memoryDelete]。
 */
export function getMemoryTools(basePath: string): ToolFunction[] {
  const config = memory.init(basePath);

  function memoryRead(p: string): string {
    return memory.view(p, null, config);
  }
  Object.defineProperty(memoryRead, "name", { value: "memory_read" });

  function memoryWrite(p: string, content: string): string {
    try {
      return memory.create(p, content, config);
    } catch (e: unknown) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  Object.defineProperty(memoryWrite, "name", { value: "memory_write" });

  function memoryUpdate(p: string, oldText: string, newText: string): string {
    try {
      return memory.strReplace(p, oldText, newText, config);
    } catch (e: unknown) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  Object.defineProperty(memoryUpdate, "name", { value: "memory_update" });

  function memoryDelete(p: string): string {
    try {
      return memory.deleteEntry(p, config);
    } catch (e: unknown) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  Object.defineProperty(memoryDelete, "name", { value: "memory_delete" });

  return [memoryRead, memoryWrite, memoryUpdate, memoryDelete] as ToolFunction[];
}

/**
 * 创建绑定到指定根路径的 select 工具集。
 * 返回 [fileList, fileSearch, fileRead]。
 */
export function getSelectTools(
  basePath: string,
  opts: {
    maxDepth?: number;
    maxResults?: number;
  } = {}
): ToolFunction[] {
  const config = select.configure({
    basePath,
    maxDepth: opts.maxDepth ?? 5,
    maxResults: opts.maxResults ?? 50,
  });

  function fileList(p: string = ".", pattern?: string): string {
    const entries = select.listDir(p, { pattern: pattern ?? null, config });
    if (typeof entries === "string") return entries;
    return entries
      .map((e) => `[${e.type === "directory" ? "dir" : "file"}] ${e.path}`)
      .join("\n");
  }
  Object.defineProperty(fileList, "name", { value: "file_list" });

  function fileSearch(
    pattern: string,
    p: string = ".",
    filePattern?: string
  ): string {
    const matches = select.grep(pattern, p, {
      filePattern: filePattern ?? null,
      config,
    });
    if (typeof matches === "string") return matches;
    if (!matches.length) return "No matches found.";
    return matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join("\n");
  }
  Object.defineProperty(fileSearch, "name", { value: "file_search" });

  function fileRead(
    filePath: string,
    startLine?: number,
    endLine?: number
  ): string {
    const result = select.readFile(filePath, {
      startLine: startLine ?? null,
      endLine: endLine ?? null,
      config,
    });
    if (typeof result === "string") return result;
    const lines = result.content.split("\n");
    const numbered = lines
      .map(
        (line, i) =>
          `${String(i + result.startLine).padStart(4, " ")}: ${line}`
      )
      .join("\n");
    return `${result.path} (${result.totalLines} lines)\n${numbered}`;
  }
  Object.defineProperty(fileRead, "name", { value: "file_read" });

  return [fileList, fileSearch, fileRead] as ToolFunction[];
}

/**
 * 同时创建 memory 和 select 工具集并合并返回。
 */
export function getAllTools(
  memoryPath: string,
  selectPath: string,
  opts: {
    maxDepth?: number;
    maxResults?: number;
  } = {}
): ToolFunction[] {
  return [...getMemoryTools(memoryPath), ...getSelectTools(selectPath, opts)];
}
