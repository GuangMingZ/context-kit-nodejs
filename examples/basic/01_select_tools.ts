/**
 * Select 工具示例 - 即时（JIT）上下文检索（渐进式披露）。
 *
 * 演示 select 模块的标准使用模式：
 *   listDir（目录结构）-> find（文件发现）-> grep（内容搜索）-> readFile（加载内容）
 * 该模式让 Agent 能够高效地导航代码库。
 *
 * 运行方式：
 *   cd context-kit-nodejs && npm run example:select
 */

import { listDir, find, grep, readFile } from "../../src/index.js";
import { printHeader, printInfo, printItem, printSection } from "../util.js";

function main(): void {
  printHeader("JIT Context Retrieval (Select Tools)");

  // 1. listDir - 理解目录结构
  printSection("1. listDir - Explore directory structure");
  const entries = listDir(".", { maxDepth: 1 });
  if (typeof entries === "string") {
    printInfo(`Error: ${entries}`);
    return;
  }
  for (const e of entries.slice(0, 8)) {
    printItem(`[${e.type}] ${e.path}`);
  }

  // 2. find - 按模式发现文件
  printSection("2. find - Discover TypeScript files");
  const files = find(".", { name: "*.ts", type: "file", maxDepth: 2 });
  if (typeof files === "string") {
    printInfo(`Error: ${files}`);
    return;
  }
  for (const f of files.slice(0, 5)) {
    printItem(f);
  }
  if (files.length > 5) {
    printInfo(`  ... and ${files.length - 5} more`);
  }

  // 3. grep - 搜索内容
  printSection("3. grep - Search for function definitions");
  const matches = grep("export function", "src", {
    filePattern: "*.ts",
    maxResults: 5,
  });
  if (typeof matches === "string") {
    printInfo(`Error: ${matches}`);
    return;
  }
  for (const m of matches) {
    printItem(`${m.file}:${m.line} ${m.content.trim().slice(0, 50)}`);
  }

  // 4. readFile - 加载具体内容
  if (matches.length > 0) {
    printSection(`4. readFile - Read src/${matches[0].file}`);
    const content = readFile(`src/${matches[0].file}`, {
      startLine: 1,
      endLine: 10,
    });
    if (typeof content === "string") {
      printInfo(`Error: ${content}`);
      return;
    }
    printInfo(`Lines 1-${content.endLine} of ${content.totalLines}`);
    for (const line of content.content.split("\n").slice(0, 8)) {
      printInfo(`  ${line}`);
    }
  }
}

main();
