import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  SelectConfig,
  configure,
  listDir,
  find,
  grep,
  readFile,
  explore,
} from "../src/select.js";

let tmpDir: string;
let config: SelectConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-kit-select-test-"));
  // Create a small test file tree
  fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "src", "utils"), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, "README.md"), "# Project\nA test project.");
  fs.writeFileSync(
    path.join(tmpDir, "src", "index.ts"),
    "export function hello() {\n  return 'hello';\n}\n"
  );
  fs.writeFileSync(
    path.join(tmpDir, "src", "utils", "helpers.ts"),
    "export function add(a: number, b: number) {\n  return a + b;\n}\n"
  );
  fs.writeFileSync(
    path.join(tmpDir, "tests", "index.test.ts"),
    "import { hello } from '../src/index';\nconsole.log(hello());\n"
  );

  config = configure({ basePath: tmpDir });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Select - listDir", () => {
  it("lists files and directories", () => {
    const entries = listDir(tmpDir, { config });
    expect(Array.isArray(entries)).toBe(true);
    const arr = entries as { path: string; type: string }[];
    expect(arr.some((e) => e.type === "directory")).toBe(true);
    expect(arr.some((e) => e.type === "file")).toBe(true);
  });

  it("respects maxDepth=1", () => {
    const entries = listDir(tmpDir, { maxDepth: 1, config }) as { path: string }[];
    const deepEntry = entries.find((e) =>
      e.path.includes(path.join("src", "utils"))
    );
    expect(deepEntry).toBeUndefined();
  });

  it("filters by pattern", () => {
    const entries = listDir(tmpDir, { pattern: "*.md", config }) as { path: string }[];
    expect(entries.some((e) => e.path.endsWith(".md"))).toBe(true);
    expect(entries.every((e) => e.path.endsWith(".md") || e.path === "src" || e.path === "tests" || e.path.includes("utils"))).toBe(true);
  });

  it("returns error for nonexistent path", () => {
    const result = listDir("/nonexistent_path_xyz", { config: new SelectConfig() });
    expect(typeof result).toBe("string");
    expect(result as string).toContain("Error");
  });

  it("returns error for file path", () => {
    const filePath = path.join(tmpDir, "README.md");
    const result = listDir(filePath, { config });
    expect(typeof result).toBe("string");
    expect(result as string).toContain("Error");
  });

  it("skips hidden files", () => {
    fs.writeFileSync(path.join(tmpDir, ".hidden"), "hidden");
    const entries = listDir(tmpDir, { maxDepth: 1, config }) as { path: string }[];
    expect(entries.every((e) => !e.path.startsWith("."))).toBe(true);
  });
});

describe("Select - find", () => {
  it("finds files by name pattern", () => {
    const results = find(tmpDir, { name: "*.ts", config }) as string[];
    expect(results.some((r) => r.endsWith(".ts"))).toBe(true);
  });

  it("finds only directories", () => {
    const results = find(tmpDir, { type: "dir", config }) as string[];
    expect(results.every((r) => fs.statSync(path.join(tmpDir, r)).isDirectory())).toBe(true);
  });

  it("finds only files", () => {
    const results = find(tmpDir, { type: "file", config }) as string[];
    expect(results.every((r) => fs.statSync(path.join(tmpDir, r)).isFile())).toBe(true);
  });

  it("returns all items when no name filter", () => {
    const results = find(tmpDir, { config }) as string[];
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("Select - grep", () => {
  it("finds pattern in files", () => {
    const matches = grep("function", tmpDir, { config }) as { file: string; line: number; content: string }[];
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.content.includes("function"))).toBe(true);
  });

  it("filters by file pattern", () => {
    const matches = grep("hello", tmpDir, {
      filePattern: "*.test.ts",
      config,
    }) as { file: string }[];
    expect(matches.every((m) => m.file.endsWith(".test.ts"))).toBe(true);
  });

  it("supports case-insensitive search", () => {
    const matches = grep("EXPORT", tmpDir, { ignoreCase: true, config }) as { content: string }[];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.content.toLowerCase().includes("export"))).toBe(true);
  });

  it("returns empty array when no matches", () => {
    const matches = grep("xyzxyzxyz_not_found", tmpDir, { config }) as unknown[];
    expect(matches).toHaveLength(0);
  });

  it("returns error for invalid regex", () => {
    const result = grep("[invalid(regex", tmpDir, { config });
    expect(typeof result).toBe("string");
    expect(result as string).toContain("Error");
  });

  it("respects maxResults", () => {
    const matches = grep(".", tmpDir, { maxResults: 2, config }) as unknown[];
    expect(matches.length).toBeLessThanOrEqual(2);
  });

  it("searches a single file", () => {
    const filePath = path.join(tmpDir, "src", "index.ts");
    const matches = grep("hello", filePath, { config }) as { content: string }[];
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe("Select - readFile", () => {
  it("reads full file content", () => {
    const result = readFile(path.join(tmpDir, "README.md"), { config });
    expect(typeof result).toBe("object");
    const fc = result as { content: string; totalLines: number };
    expect(fc.content).toContain("# Project");
    expect(fc.totalLines).toBeGreaterThan(0);
  });

  it("reads partial file with line range", () => {
    const result = readFile(path.join(tmpDir, "src", "index.ts"), {
      startLine: 1,
      endLine: 1,
      config,
    }) as { content: string; startLine: number; endLine: number };
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(1);
    expect(result.content.split("\n")).toHaveLength(1);
  });

  it("returns error for nonexistent file", () => {
    const result = readFile("/nonexistent/file.ts", { config: new SelectConfig() });
    expect(typeof result).toBe("string");
    expect(result as string).toContain("Error");
  });

  it("returns error for directory path", () => {
    const result = readFile(path.join(tmpDir, "src"), { config });
    expect(typeof result).toBe("string");
    expect(result as string).toContain("Error");
  });
});

describe("Select - explore", () => {
  it("returns entries with no query", () => {
    const result = explore(tmpDir, { config }) as { entries: unknown[] };
    expect(result.entries).toBeDefined();
    expect(Array.isArray(result.entries)).toBe(true);
  });

  it("returns entries + matches with query", () => {
    const result = explore(tmpDir, {
      query: "function",
      config,
    }) as { entries: unknown[]; matches: unknown[] };
    expect(result.entries).toBeDefined();
    expect(result.matches).toBeDefined();
    expect(result.matches.length).toBeGreaterThan(0);
  });
});

describe("Select - SelectConfig security", () => {
  it("rejects path traversal (..) when base_path is set", () => {
    const cfg = new SelectConfig({ basePath: tmpDir });
    expect(() => cfg.validatePath("../etc/passwd")).toThrow();
  });

  it("rejects home expansion (~)", () => {
    const cfg = new SelectConfig({ basePath: tmpDir });
    expect(() => cfg.validatePath("~/secret")).toThrow();
  });

  it("allows any path when no base_path set", () => {
    const cfg = new SelectConfig();
    expect(() => cfg.validatePath(tmpDir)).not.toThrow();
  });
});
