/**
 * Memory 模块 - 遵循 Claude Memory Tool 接口的上下文持久化工具。
 *
 * 将信息持久化到上下文窗口之外，基于本地文件系统实现。
 * 包含路径遍历防护和大小限制等安全约束。
 *
 * 提供的操作：
 *  - view:       查看目录内容或文件内容
 *  - create:     创建新文件（若已存在则返回错误）
 *  - strReplace: 替换文件中的文本（要求匹配唯一）
 *  - insert:     在指定行插入文本
 *  - deleteEntry: 删除文件或目录
 *  - rename:     重命名或移动文件/目录
 *  - clearAll:   清空所有 memory 数据
 */

import fs from "node:fs";
import path from "node:path";

export class MemoryConfig {
  basePath: string;
  memoryRoot: string;
  maxFileSize: number;
  maxLineLength: number;

  constructor(
    basePath: string = "./memory",
    maxFileSize = 1024 * 1024,
    maxLineLength = 2000
  ) {
    this.basePath = path.resolve(basePath);
    this.memoryRoot = path.join(this.basePath, "memories");
    this.maxFileSize = maxFileSize;
    this.maxLineLength = maxLineLength;
  }

  /**
   * 验证并解析 memory 路径，防止路径遍历攻击。
   * 路径必须以 /memories 开头，且不能逃逸出 memoryRoot。
   */
  validatePath(p: string): string {
    if (!p.startsWith("/memories")) {
      throw new Error(`Path must start with /memories, got: ${p}`);
    }
    const relative = p.slice("/memories".length).replace(/^\//, "");
    const full = relative
      ? path.join(this.memoryRoot, relative)
      : this.memoryRoot;

    const resolvedFull = path.resolve(full);
    const resolvedRoot = path.resolve(this.memoryRoot);
    if (!resolvedFull.startsWith(resolvedRoot + path.sep) && resolvedFull !== resolvedRoot) {
      throw new Error(`Path ${p} would escape /memories directory`);
    }
    return full;
  }
}

/** 全局默认配置，由 init() 初始化。 */
let _memoryConfig: MemoryConfig | null = null;

function getMemoryConfig(): MemoryConfig {
  if (!_memoryConfig) return init();
  return _memoryConfig;
}

/**
 * 初始化或重新配置 memory 模块。
 * 若 memories 目录不存在则自动创建。
 */
export function init(
  basePath: string = "./memory",
  maxFileSize = 1024 * 1024,
  maxLineLength = 2000
): MemoryConfig {
  _memoryConfig = new MemoryConfig(basePath, maxFileSize, maxLineLength);
  if (!fs.existsSync(_memoryConfig.memoryRoot)) {
    fs.mkdirSync(_memoryConfig.memoryRoot, { recursive: true });
  }
  return _memoryConfig;
}

/** 将字节数格式化为人类可读的大小字符串（B/K/M/G）。 */
function humanReadableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

/** 递归统计目录的总字节大小。 */
function getDirSize(dirPath: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const p = path.join(
          entry.parentPath ?? (entry as unknown as Record<string, string>)["path"] ?? dirPath,
          entry.name
        );
        try {
          total += fs.statSync(p).size;
        } catch { /* 忽略不可访问的文件 */ }
      }
    }
  } catch { /* 忽略读取失败 */ }
  return total;
}

/**
 * 查看目录内容或文件内容（带行号）。
 * 目录最多展示两层深度，文件支持 viewRange 指定行范围。
 */
export function view(
  p: string = "/memories",
  viewRange?: [number, number] | null,
  config?: MemoryConfig | null
): string {
  const cfg = config ?? getMemoryConfig();
  const fullPath = cfg.validatePath(p);

  if (!fs.existsSync(fullPath)) {
    return `The path ${p} does not exist. Please provide a valid path.`;
  }

  const stat = fs.statSync(fullPath);

  if (stat.isDirectory()) {
    const items: [string, number][] = [];
    const rootSize = getDirSize(fullPath);
    items.push([p, rootSize]);

    const entries = fs.readdirSync(fullPath, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const itemPath = p === "/memories" ? `/memories/${entry.name}` : `${p}/${entry.name}`;
      const itemFull = path.join(fullPath, entry.name);

      if (entry.isFile()) {
        items.push([itemPath, fs.statSync(itemFull).size]);
      } else if (entry.isDirectory()) {
        items.push([itemPath, getDirSize(itemFull)]);
        // 第二层
        const subEntries = fs
          .readdirSync(itemFull, { withFileTypes: true })
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const sub of subEntries) {
          if (sub.name.startsWith(".") || sub.name === "node_modules") continue;
          const subPath = `${itemPath}/${sub.name}`;
          const subFull = path.join(itemFull, sub.name);
          if (sub.isFile()) {
            items.push([subPath, fs.statSync(subFull).size]);
          } else if (sub.isDirectory()) {
            items.push([subPath, getDirSize(subFull)]);
          }
        }
      }
    }

    let result = `Here're the files and directories up to 2 levels deep in ${p}, excluding hidden items and node_modules:`;
    for (const [itemPath, size] of items) {
      result += `\n${humanReadableSize(size)}\t${itemPath}`;
    }
    return result;
  }

  if (stat.isFile()) {
    const content = fs.readFileSync(fullPath, "utf-8");
    let lines = content.split("\n");

    if (lines.length > 999999) {
      return `File ${p} exceeds maximum line limit of 999,999 lines.`;
    }

    let startNum = 1;
    if (viewRange) {
      const start = Math.max(1, viewRange[0]) - 1;
      const end = viewRange[1] === -1 ? lines.length : viewRange[1];
      lines = lines.slice(start, end);
      startNum = start + 1;
    }

    let result = `Here's the content of ${p} with line numbers:`;
    lines.forEach((line, i) => {
      result += `\n${String(i + startNum).padStart(6, " ")}\t${line}`;
    });
    return result;
  }

  return `The path ${p} does not exist. Please provide a valid path.`;
}

/**
 * 创建新文件（若文件已存在则返回错误字符串，不抛出异常）。
 * 内容超出 maxFileSize 时抛出 Error。
 */
export function create(
  p: string,
  fileText: string,
  config?: MemoryConfig | null
): string {
  const cfg = config ?? getMemoryConfig();
  const fullPath = cfg.validatePath(p);

  if (fs.existsSync(fullPath)) {
    return `Error: File ${p} already exists`;
  }

  const byteLen = Buffer.byteLength(fileText, "utf-8");
  if (byteLen > cfg.maxFileSize) {
    throw new Error(`Content exceeds maximum size of ${cfg.maxFileSize} bytes`);
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, fileText, "utf-8");
  return `File created successfully at: ${p}`;
}

/**
 * 替换文件中的文本。
 * oldStr 必须在文件中恰好出现一次（唯一性要求），否则返回错误字符串。
 */
export function strReplace(
  p: string,
  oldStr: string,
  newStr: string,
  config?: MemoryConfig | null
): string {
  const cfg = config ?? getMemoryConfig();
  const fullPath = cfg.validatePath(p);

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return `Error: The path ${p} does not exist. Please provide a valid path.`;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const count = content.split(oldStr).length - 1;

  if (count === 0) {
    return `No replacement was performed, old_str \`${oldStr}\` did not appear verbatim in ${p}.`;
  }
  if (count > 1) {
    const lines = content.split("\n");
    const lineNumbers = lines
      .map((l, i) => (l.includes(oldStr) ? i + 1 : -1))
      .filter((n) => n >= 0);
    return `No replacement was performed. Multiple occurrences of old_str \`${oldStr}\` in lines: [${lineNumbers.join(", ")}]. Please ensure it is unique`;
  }

  const newContent = content.replace(oldStr, newStr);
  fs.writeFileSync(fullPath, newContent, "utf-8");

  // 返回替换位置附近的代码片段，便于确认修改效果
  const newLines = newContent.split("\n");
  for (let i = 0; i < newLines.length; i++) {
    if (newLines[i].includes(newStr)) {
      const start = Math.max(0, i - 2);
      const end = Math.min(newLines.length, i + 3);
      const snippet = newLines
        .slice(start, end)
        .map((l, j) => `${String(start + j + 1).padStart(6, " ")}\t${l}`)
        .join("\n");
      return `The memory file has been edited.\n${snippet}`;
    }
  }
  return "The memory file has been edited.";
}

/**
 * 在指定行（0-indexed）处插入文本。
 * insertLine=0 表示在文件最开头插入。
 */
export function insert(
  p: string,
  insertLine: number,
  insertText: string,
  config?: MemoryConfig | null
): string {
  const cfg = config ?? getMemoryConfig();
  const fullPath = cfg.validatePath(p);

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return `Error: The path ${p} does not exist`;
  }

  const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
  const nLines = lines.length;

  if (insertLine < 0 || insertLine > nLines) {
    return (
      `Error: Invalid \`insert_line\` parameter: ${insertLine}. ` +
      `It should be within the range of lines of the file: [0, ${nLines}]`
    );
  }

  lines.splice(insertLine, 0, insertText.replace(/\n$/, ""));
  fs.writeFileSync(fullPath, lines.join("\n") + "\n", "utf-8");
  return `The file ${p} has been edited.`;
}

/**
 * 删除文件或目录（目录递归删除）。
 * 不允许删除 /memories 根目录。
 */
export function deleteEntry(p: string, config?: MemoryConfig | null): string {
  const cfg = config ?? getMemoryConfig();
  const fullPath = cfg.validatePath(p);

  if (p === "/memories") {
    return "Error: Cannot delete the /memories directory itself";
  }
  if (!fs.existsSync(fullPath)) {
    return `Error: The path ${p} does not exist`;
  }

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    fs.unlinkSync(fullPath);
    return `Successfully deleted ${p}`;
  } else if (stat.isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    return `Successfully deleted ${p}`;
  }
  return `Error: The path ${p} does not exist`;
}

/**
 * 重命名或移动文件/目录。
 * 目标路径已存在时返回错误字符串。
 */
export function rename(
  oldPath: string,
  newPath: string,
  config?: MemoryConfig | null
): string {
  const cfg = config ?? getMemoryConfig();
  const oldFull = cfg.validatePath(oldPath);
  const newFull = cfg.validatePath(newPath);

  if (!fs.existsSync(oldFull)) {
    return `Error: The path ${oldPath} does not exist`;
  }
  if (fs.existsSync(newFull)) {
    return `Error: The destination ${newPath} already exists`;
  }

  fs.mkdirSync(path.dirname(newFull), { recursive: true });
  fs.renameSync(oldFull, newFull);
  return `Successfully renamed ${oldPath} to ${newPath}`;
}

/**
 * 清空所有 memory 数据（删除并重建 memories 目录）。
 */
export function clearAll(config?: MemoryConfig | null): string {
  const cfg = config ?? getMemoryConfig();
  if (fs.existsSync(cfg.memoryRoot)) {
    fs.rmSync(cfg.memoryRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(cfg.memoryRoot, { recursive: true });
  return "All memory cleared";
}
