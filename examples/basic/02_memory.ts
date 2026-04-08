/**
 * Memory 示例 - 上下文持久化（遵循 Claude Memory Tool 接口）。
 *
 * 演示 memory 模块的持久化 Agent 记忆功能：
 * - create、view、strReplace、insert、deleteEntry、rename
 *
 * 运行方式：
 *   cd context-kit-nodejs && npm run example:memory
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import * as memory from "../../src/index.js";
import { printHeader, printInfo, printSection } from "../util.js";

function main(): void {
  printHeader("Context Persistence (Memory Tools)");

  // 使用系统临时目录，运行后自动清理
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "context-kit-"));
  try {
    memory.initMemory(tmpdir);

    // 1. create - 创建文件
    printSection("1. create - Create analysis file");
    const createResult = memory.create(
      "/memories/analysis.md",
      "# JWT Module Analysis\n\n- Entry point: login()\n- Dependencies: utils.ts"
    );
    printInfo(createResult);

    // 2. view - 查看目录
    printSection("2. view - List directory");
    printInfo(memory.view("/memories"));

    // 3. view - 查看文件内容
    printSection("3. view - Read file");
    printInfo(memory.view("/memories/analysis.md"));

    // 4. strReplace - 替换文本
    printSection("4. strReplace - Update text");
    const replaceResult = memory.strReplace(
      "/memories/analysis.md",
      "Entry point: login()",
      "Entry point: authenticate()"
    );
    printInfo(replaceResult);

    // 5. insert - 在指定行插入文本
    printSection("5. insert - Add line");
    const insertResult = memory.insert(
      "/memories/analysis.md",
      3,
      "- Security: JWT tokens"
    );
    printInfo(insertResult);

    // 6. 查看更新后的内容
    printSection("6. view - Updated content");
    printInfo(memory.view("/memories/analysis.md"));

    // 7. rename - 重命名文件
    printSection("7. rename - Rename file");
    const renameResult = memory.rename(
      "/memories/analysis.md",
      "/memories/jwt_analysis.md"
    );
    printInfo(renameResult);

    // 8. 查看最终状态
    printSection("8. view - Final state");
    printInfo(memory.view("/memories"));
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
}

main();
