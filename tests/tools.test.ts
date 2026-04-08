import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getMemoryTools, getSelectTools, getAllTools } from "../src/tools.js";

let tmpMemDir: string;
let tmpSrcDir: string;

beforeEach(() => {
  tmpMemDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-kit-tools-mem-"));
  tmpSrcDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-kit-tools-src-"));

  fs.writeFileSync(
    path.join(tmpSrcDir, "hello.ts"),
    "export function hello() {\n  return 'hello';\n}\n"
  );
  fs.mkdirSync(path.join(tmpSrcDir, "lib"), { recursive: true });
  fs.writeFileSync(path.join(tmpSrcDir, "lib", "util.ts"), "export const PI = 3.14;\n");
});

afterEach(() => {
  fs.rmSync(tmpMemDir, { recursive: true, force: true });
  fs.rmSync(tmpSrcDir, { recursive: true, force: true });
});

describe("getMemoryTools", () => {
  it("returns 4 tool functions", () => {
    const tools = getMemoryTools(tmpMemDir);
    expect(tools).toHaveLength(4);
    tools.forEach((t) => expect(typeof t).toBe("function"));
  });

  it("memory_read returns directory listing", () => {
    const [memoryRead] = getMemoryTools(tmpMemDir);
    const result = memoryRead("/memories");
    expect(typeof result).toBe("string");
    expect(result).toContain("/memories");
  });

  it("memory_write creates a file", () => {
    const [, memoryWrite] = getMemoryTools(tmpMemDir);
    const result = memoryWrite("/memories/note.md", "# Test\nContent");
    expect(result).toContain("created");
    expect(
      fs.existsSync(path.join(tmpMemDir, "memories", "note.md"))
    ).toBe(true);
  });

  it("memory_write returns error if file exists", () => {
    const [, memoryWrite] = getMemoryTools(tmpMemDir);
    memoryWrite("/memories/note.md", "first");
    const result = memoryWrite("/memories/note.md", "second");
    expect(result).toContain("already exists");
  });

  it("memory_update replaces text in file", () => {
    const [, memoryWrite, memoryUpdate] = getMemoryTools(tmpMemDir);
    memoryWrite("/memories/note.md", "old text here");
    const result = memoryUpdate("/memories/note.md", "old text", "new text");
    expect(result).toContain("edited");
  });

  it("memory_delete removes a file", () => {
    const [, memoryWrite, , memoryDelete] = getMemoryTools(tmpMemDir);
    memoryWrite("/memories/temp.md", "temp");
    const result = memoryDelete("/memories/temp.md");
    expect(result).toContain("Successfully deleted");
    expect(
      fs.existsSync(path.join(tmpMemDir, "memories", "temp.md"))
    ).toBe(false);
  });

  it("memory_read reads file content", () => {
    const [memoryRead, memoryWrite] = getMemoryTools(tmpMemDir);
    memoryWrite("/memories/info.md", "Hello, world!\nSecond line.");
    const result = memoryRead("/memories/info.md");
    expect(result).toContain("Hello, world!");
    expect(result).toContain("Second line.");
  });
});

describe("getSelectTools", () => {
  it("returns 3 tool functions", () => {
    const tools = getSelectTools(tmpSrcDir);
    expect(tools).toHaveLength(3);
    tools.forEach((t) => expect(typeof t).toBe("function"));
  });

  it("file_list lists directory contents", () => {
    const [fileList] = getSelectTools(tmpSrcDir);
    const result = fileList(tmpSrcDir);
    expect(typeof result).toBe("string");
    expect(result).toContain("hello.ts");
  });

  it("file_search finds pattern in files", () => {
    const [, fileSearch] = getSelectTools(tmpSrcDir);
    const result = fileSearch("function", tmpSrcDir);
    expect(typeof result).toBe("string");
    expect(result).toContain("function");
  });

  it("file_search returns 'No matches found' when no matches", () => {
    const [, fileSearch] = getSelectTools(tmpSrcDir);
    const result = fileSearch("xyz_not_found_pattern_12345", tmpSrcDir);
    expect(result).toBe("No matches found.");
  });

  it("file_read reads file content with line numbers", () => {
    const [, , fileRead] = getSelectTools(tmpSrcDir);
    const filePath = path.join(tmpSrcDir, "hello.ts");
    const result = fileRead(filePath);
    expect(typeof result).toBe("string");
    expect(result).toContain("hello.ts");
    expect(result).toContain("function hello");
  });

  it("file_read supports line range", () => {
    const [, , fileRead] = getSelectTools(tmpSrcDir);
    const filePath = path.join(tmpSrcDir, "hello.ts");
    const result = fileRead(filePath, 1, 1);
    expect(typeof result).toBe("string");
    expect(result).toContain("1:");
  });

  it("file_list filters by pattern", () => {
    const [fileList] = getSelectTools(tmpSrcDir);
    const result = fileList(tmpSrcDir, "*.ts");
    expect(typeof result).toBe("string");
    expect(result).toContain(".ts");
  });
});

describe("getAllTools", () => {
  it("returns 7 tools total", () => {
    const tools = getAllTools(tmpMemDir, tmpSrcDir);
    expect(tools).toHaveLength(7);
  });

  it("combines memory and select tools", () => {
    const allTools = getAllTools(tmpMemDir, tmpSrcDir);
    const memTools = getMemoryTools(tmpMemDir);
    const selTools = getSelectTools(tmpSrcDir);
    expect(allTools).toHaveLength(memTools.length + selTools.length);
  });
});
