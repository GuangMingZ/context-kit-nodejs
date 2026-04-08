/**
 * Select 模块 - 即时（JIT）上下文检索。
 *
 * 实现"渐进式披露"模式：
 *   listDir（目录结构）-> find（文件发现）-> grep（内容搜索）-> readFile（加载内容）
 *
 * 设计原则：
 *  - 引用即上下文：用路径等轻量标识符替代完整内容，节省 token
 *  - 渐进式披露：按需逐步揭示信息，而非一次性加载
 *  - Agent 友好：返回错误字符串而非抛出异常，不破坏 Agent 循环
 *  - 安全性：路径遍历防护与文件大小限制
 */

import fs from "node:fs";
import path from "node:path";

/** 目录项，包含路径、类型及可选的文件大小。 */
export interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

/** grep 匹配结果，包含文件路径、行号及行内容。 */
export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

/** readFile 返回的文件内容，包含路径、内容、行范围及总行数。 */
export interface FileContent {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
}

/** explore 的复合返回结果，包含目录项列表及可选的 grep 匹配结果。 */
export interface ExploreResult {
  entries: FileEntry[];
  matches?: GrepMatch[];
}

/** select 操作的配置，包含根路径及各类限制参数。 */
export class SelectConfig {
  basePath: string | null;
  maxDepth: number;
  maxResults: number;
  maxFileSize: number;
  maxLineLength: number;
  maxReadLines: number;

  constructor(opts: {
    basePath?: string | null;
    maxDepth?: number;
    maxResults?: number;
    maxFileSize?: number;
    maxLineLength?: number;
    maxReadLines?: number;
  } = {}) {
    this.basePath = opts.basePath ? path.resolve(opts.basePath) : null;
    this.maxDepth = opts.maxDepth ?? 10;
    this.maxResults = opts.maxResults ?? 100;
    this.maxFileSize = opts.maxFileSize ?? 10 * 1024 * 1024;
    this.maxLineLength = opts.maxLineLength ?? 2000;
    this.maxReadLines = opts.maxReadLines ?? 1000;
  }

  /**
   * 验证并解析路径，防止路径遍历攻击（.. 和 ~ 均被拒绝）。
   * 若配置了 basePath，则路径必须在其范围内。
   */
  validatePath(p: string | Buffer): string {
    const str = p.toString();
    if (str.includes("..") || str.startsWith("~")) {
      throw new Error(`Path traversal not allowed: ${str}`);
    }
    const resolved = path.resolve(str);
    if (this.basePath !== null) {
      if (
        !resolved.startsWith(this.basePath + path.sep) &&
        resolved !== this.basePath
      ) {
        throw new Error(
          `Path '${str}' is outside allowed base path '${this.basePath}'`
        );
      }
    }
    return resolved;
  }
}

/** 全局默认配置，由 configure() 覆盖。 */
let _defaultConfig = new SelectConfig();

/**
 * 配置 select 操作的全局默认参数。
 * 返回新的 SelectConfig 实例。
 */
export function configure(opts: {
  basePath?: string | null;
  maxDepth?: number;
  maxResults?: number;
  maxFileSize?: number;
  maxLineLength?: number;
  maxReadLines?: number;
} = {}): SelectConfig {
  _defaultConfig = new SelectConfig(opts);
  return _defaultConfig;
}

/**
 * 列出目录内容，支持深度限制和文件名模式过滤。
 * 隐藏文件（以 . 开头）自动跳过。
 * 出错时返回错误字符串而非抛出异常。
 */
export function listDir(
  dirPath: string = ".",
  opts: {
    maxDepth?: number;
    pattern?: string | null;
    config?: SelectConfig | null;
  } = {}
): FileEntry[] | string {
  try {
    const cfg = opts.config ?? _defaultConfig;
    const resolvedPath = cfg.validatePath(dirPath);
    const effectiveMaxDepth = opts.maxDepth ?? cfg.maxDepth;

    if (!fs.existsSync(resolvedPath)) {
      return `Error: Path does not exist: ${dirPath}`;
    }
    if (!fs.statSync(resolvedPath).isDirectory()) {
      return `Error: Path is not a directory: ${dirPath}`;
    }

    const entries: FileEntry[] = [];
    // 将 glob 风格的 pattern 转换为正则（仅支持 * 通配符）
    const patternRegex = opts.pattern
      ? new RegExp(
          "^" + opts.pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
        )
      : null;

    function walk(currentPath: string, depth: number): void {
      if (depth > effectiveMaxDepth) return;

      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(currentPath, { withFileTypes: true }).sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      } catch {
        return;
      }

      for (const item of items) {
        if (item.name.startsWith(".")) continue;

        // 目录总是递归遍历，pattern 仅过滤文件名
        if (patternRegex && !patternRegex.test(item.name) && !item.isDirectory()) {
          continue;
        }

        const itemFull = path.join(currentPath, item.name);
        let relPath: string;
        try {
          relPath = path.relative(resolvedPath, itemFull);
        } catch {
          relPath = itemFull;
        }

        if (item.isDirectory()) {
          entries.push({ path: relPath, type: "directory" });
          walk(itemFull, depth + 1);
        } else {
          let size: number | undefined;
          try {
            size = fs.statSync(itemFull).size;
          } catch { /* 忽略不可访问的文件 */ }
          entries.push({ path: relPath, type: "file", size });
        }
      }
    }

    walk(resolvedPath, 1);
    return entries;
  } catch (e: unknown) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * 按名称模式和类型查找文件或目录。
 * name 支持 * 和 ? 通配符；type 可为 "file" 或 "dir"。
 */
export function find(
  dirPath: string = ".",
  opts: {
    name?: string | null;
    type?: "file" | "dir" | null;
    maxDepth?: number;
    config?: SelectConfig | null;
  } = {}
): string[] | string {
  try {
    const cfg = opts.config ?? _defaultConfig;
    const resolvedPath = cfg.validatePath(dirPath);
    const effectiveMaxDepth = opts.maxDepth ?? cfg.maxDepth;

    if (!fs.existsSync(resolvedPath)) {
      return `Error: Path does not exist: ${dirPath}`;
    }
    if (!fs.statSync(resolvedPath).isDirectory()) {
      return `Error: Path is not a directory: ${dirPath}`;
    }

    const results: string[] = [];
    // 将文件名模式转换为正则（支持 * 和 ? 通配符）
    const nameRegex = opts.name
      ? new RegExp(
          "^" +
            opts.name.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") +
            "$"
        )
      : null;

    function walk(currentPath: string, depth: number): void {
      if (depth > effectiveMaxDepth) return;

      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(currentPath, { withFileTypes: true }).sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      } catch {
        return;
      }

      for (const item of items) {
        if (item.name.startsWith(".")) continue;

        const isDir = item.isDirectory();
        const itemFull = path.join(currentPath, item.name);

        // 仅查找文件时跳过目录（但仍需递归）
        if (opts.type === "file" && isDir) {
          walk(itemFull, depth + 1);
          continue;
        }
        // 仅查找目录时跳过文件
        if (opts.type === "dir" && !isDir) continue;

        if (nameRegex && !nameRegex.test(item.name)) {
          if (isDir) walk(itemFull, depth + 1);
          continue;
        }

        let relPath: string;
        try {
          relPath = path.relative(resolvedPath, itemFull);
        } catch {
          relPath = itemFull;
        }

        results.push(relPath);
        if (isDir) walk(itemFull, depth + 1);
      }
    }

    walk(resolvedPath, 1);
    return results;
  } catch (e: unknown) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * 在文件中搜索正则表达式模式。
 * 支持 filePattern 按文件名过滤、ignoreCase 大小写不敏感。
 * 结果数量上限由 maxResults 控制。
 */
export function grep(
  pattern: string,
  dirPath: string = ".",
  opts: {
    filePattern?: string | null;
    ignoreCase?: boolean;
    maxResults?: number;
    config?: SelectConfig | null;
  } = {}
): GrepMatch[] | string {
  try {
    const cfg = opts.config ?? _defaultConfig;
    const resolvedPath = cfg.validatePath(dirPath);
    const effectiveMaxResults = opts.maxResults ?? cfg.maxResults;

    const flags = opts.ignoreCase ? "i" : "";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return `Error: Invalid regex pattern: ${pattern}`;
    }

    const matches: GrepMatch[] = [];

    function searchFile(filePath: string): void {
      if (matches.length >= effectiveMaxResults) return;

      let fileSize: number;
      try {
        fileSize = fs.statSync(filePath).size;
      } catch {
        return;
      }
      // 跳过超出大小限制的文件
      if (fileSize > cfg.maxFileSize) return;

      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        return;
      }

      const lines = content.split("\n");
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        if (matches.length >= effectiveMaxResults) break;
        if (regex.test(line)) {
          let trimmed = line.replace(/\r$/, "");
          // 超长行截断，避免上下文过大
          if (trimmed.length > cfg.maxLineLength) {
            trimmed = trimmed.slice(0, cfg.maxLineLength) + "...";
          }
          let relPath: string;
          try {
            relPath = path.relative(resolvedPath, filePath);
          } catch {
            relPath = filePath;
          }
          matches.push({ file: relPath, line: lineNum, content: trimmed });
        }
      }
    }

    const filePatternRegex = opts.filePattern
      ? new RegExp(
          "^" +
            opts.filePattern
              .replace(/\./g, "\\.")
              .replace(/\*/g, ".*") +
            "$"
        )
      : null;

    if (fs.statSync(resolvedPath).isFile()) {
      // 直接搜索单个文件
      searchFile(resolvedPath);
    } else {
      function walkDir(dir: string): void {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (matches.length >= effectiveMaxResults) break;
          if (entry.name.startsWith(".")) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(full);
          } else {
            if (filePatternRegex && !filePatternRegex.test(entry.name)) continue;
            searchFile(full);
          }
        }
      }
      walkDir(resolvedPath);
    }

    return matches;
  } catch (e: unknown) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * 读取文件内容，支持指定行范围。
 * 超出 maxReadLines 时自动截断，超出 maxLineLength 的行截断并加 "..."。
 */
export function readFile(
  filePath: string,
  opts: {
    startLine?: number | null;
    endLine?: number | null;
    config?: SelectConfig | null;
  } = {}
): FileContent | string {
  try {
    const cfg = opts.config ?? _defaultConfig;
    const resolvedPath = cfg.validatePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
      return `Error: File not found: ${filePath}`;
    }
    if (fs.statSync(resolvedPath).isDirectory()) {
      return `Error: Path is a directory, not a file: ${filePath}`;
    }

    const fileSize = fs.statSync(resolvedPath).size;
    if (fileSize > cfg.maxFileSize) {
      return `Error: File too large (${fileSize} bytes). Maximum: ${cfg.maxFileSize} bytes`;
    }

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    const start = Math.max(1, opts.startLine ?? 1);
    let end = Math.min(totalLines, opts.endLine ?? totalLines);
    // 超出 maxReadLines 时截断
    if (end - start + 1 > cfg.maxReadLines) {
      end = start + cfg.maxReadLines - 1;
    }

    const selected = lines.slice(start - 1, end).map((l) => {
      const clean = l.replace(/\r$/, "");
      return clean.length > cfg.maxLineLength
        ? clean.slice(0, cfg.maxLineLength) + "..."
        : clean;
    });

    return {
      path: filePath,
      content: selected.join("\n"),
      startLine: start,
      endLine: Math.min(end, start + selected.length - 1),
      totalLines,
    };
  } catch (e: unknown) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * JIT 上下文探索的便利函数，组合 listDir 与 grep。
 * 若提供 query，同时在目录中搜索匹配行。
 */
export function explore(
  dirPath: string = ".",
  opts: {
    query?: string | null;
    filePattern?: string | null;
    maxDepth?: number;
    config?: SelectConfig | null;
  } = {}
): ExploreResult | string {
  try {
    const entries = listDir(dirPath, {
      maxDepth: opts.maxDepth ?? 2,
      pattern: opts.filePattern,
      config: opts.config,
    });
    if (typeof entries === "string") return entries;

    const result: ExploreResult = { entries };

    if (opts.query) {
      const matches = grep(opts.query, dirPath, {
        filePattern: opts.filePattern ?? undefined,
        config: opts.config,
      });
      if (typeof matches === "string") return matches;
      result.matches = matches;
    }

    return result;
  } catch (e: unknown) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
