import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  MemoryConfig,
  init,
  view,
  create,
  strReplace,
  insert,
  deleteEntry,
  rename,
  clearAll,
} from "../src/memory.js";

let tmpDir: string;
let config: MemoryConfig;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-kit-memory-test-"));
  config = init(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Memory - init", () => {
  it("creates the memories directory", () => {
    expect(fs.existsSync(config.memoryRoot)).toBe(true);
  });

  it("returns a MemoryConfig instance", () => {
    expect(config).toBeInstanceOf(MemoryConfig);
  });
});

describe("Memory - view", () => {
  it("lists root directory", () => {
    create("/memories/test.md", "# Test", config);
    const result = view("/memories", null, config);
    expect(result).toContain("/memories");
    expect(result).toContain("test.md");
  });

  it("reads file content with line numbers", () => {
    create("/memories/notes.md", "Line one\nLine two\nLine three", config);
    const result = view("/memories/notes.md", null, config);
    expect(result).toContain("Line one");
    expect(result).toContain("1");
    expect(result).toContain("2");
  });

  it("supports view_range", () => {
    create("/memories/notes.md", "L1\nL2\nL3\nL4\nL5", config);
    const result = view("/memories/notes.md", [2, 3], config);
    expect(result).toContain("L2");
    expect(result).toContain("L3");
    expect(result).not.toContain("L1");
    expect(result).not.toContain("L5");
  });

  it("returns error for nonexistent path", () => {
    const result = view("/memories/does_not_exist.md", null, config);
    expect(result).toContain("does not exist");
  });
});

describe("Memory - create", () => {
  it("creates a new file", () => {
    const result = create("/memories/new.md", "# New file\nContent here", config);
    expect(result).toContain("created successfully");
    const fullPath = path.join(config.memoryRoot, "new.md");
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it("returns error if file already exists", () => {
    create("/memories/dup.md", "content", config);
    const result = create("/memories/dup.md", "content2", config);
    expect(result).toContain("already exists");
  });

  it("creates files in subdirectories", () => {
    const result = create("/memories/subdir/file.md", "nested", config);
    expect(result).toContain("created successfully");
  });

  it("throws on content too large", () => {
    const bigContent = "x".repeat(config.maxFileSize + 1);
    expect(() => create("/memories/big.md", bigContent, config)).toThrow();
  });
});

describe("Memory - strReplace", () => {
  it("replaces unique text in file", () => {
    create("/memories/edit.md", "Hello world\nGoodbye world", config);
    const result = strReplace("/memories/edit.md", "Hello world", "Hi world", config);
    expect(result).toContain("edited");
    const content = fs.readFileSync(path.join(config.memoryRoot, "edit.md"), "utf-8");
    expect(content).toContain("Hi world");
    expect(content).not.toContain("Hello world");
  });

  it("returns error if old text not found", () => {
    create("/memories/edit.md", "some content", config);
    const result = strReplace("/memories/edit.md", "not here", "replacement", config);
    expect(result).toContain("No replacement was performed");
  });

  it("returns error if old text appears multiple times", () => {
    create("/memories/edit.md", "dup dup dup", config);
    const result = strReplace("/memories/edit.md", "dup", "new", config);
    expect(result).toContain("Multiple occurrences");
  });

  it("returns error for nonexistent file", () => {
    const result = strReplace("/memories/ghost.md", "x", "y", config);
    expect(result).toContain("does not exist");
  });
});

describe("Memory - insert", () => {
  it("inserts text at a given line", () => {
    create("/memories/todo.md", "line1\nline2\nline3", config);
    const result = insert("/memories/todo.md", 1, "inserted line", config);
    expect(result).toContain("edited");
    const content = fs.readFileSync(path.join(config.memoryRoot, "todo.md"), "utf-8");
    const lines = content.split("\n");
    expect(lines[1]).toBe("inserted line");
  });

  it("returns error for invalid line number", () => {
    create("/memories/todo.md", "line1\nline2", config);
    const result = insert("/memories/todo.md", 100, "x", config);
    expect(result).toContain("Invalid");
  });

  it("inserts at line 0 (before first line)", () => {
    create("/memories/todo.md", "existing", config);
    insert("/memories/todo.md", 0, "prepended", config);
    const content = fs.readFileSync(path.join(config.memoryRoot, "todo.md"), "utf-8");
    expect(content.startsWith("prepended")).toBe(true);
  });
});

describe("Memory - deleteEntry", () => {
  it("deletes a file", () => {
    create("/memories/del.md", "bye", config);
    const result = deleteEntry("/memories/del.md", config);
    expect(result).toContain("Successfully deleted");
    expect(fs.existsSync(path.join(config.memoryRoot, "del.md"))).toBe(false);
  });

  it("deletes a directory", () => {
    create("/memories/subdir/f.md", "content", config);
    const result = deleteEntry("/memories/subdir", config);
    expect(result).toContain("Successfully deleted");
  });

  it("returns error for nonexistent path", () => {
    const result = deleteEntry("/memories/ghost.md", config);
    expect(result).toContain("does not exist");
  });

  it("refuses to delete /memories root", () => {
    const result = deleteEntry("/memories", config);
    expect(result).toContain("Cannot delete");
  });
});

describe("Memory - rename", () => {
  it("renames a file", () => {
    create("/memories/old.md", "content", config);
    const result = rename("/memories/old.md", "/memories/new.md", config);
    expect(result).toContain("renamed");
    expect(fs.existsSync(path.join(config.memoryRoot, "new.md"))).toBe(true);
    expect(fs.existsSync(path.join(config.memoryRoot, "old.md"))).toBe(false);
  });

  it("returns error if source does not exist", () => {
    const result = rename("/memories/nope.md", "/memories/dest.md", config);
    expect(result).toContain("does not exist");
  });

  it("returns error if destination already exists", () => {
    create("/memories/src.md", "a", config);
    create("/memories/dst.md", "b", config);
    const result = rename("/memories/src.md", "/memories/dst.md", config);
    expect(result).toContain("already exists");
  });
});

describe("Memory - clearAll", () => {
  it("clears all memory files", () => {
    create("/memories/a.md", "a", config);
    create("/memories/b.md", "b", config);
    const result = clearAll(config);
    expect(result).toBe("All memory cleared");
    const remaining = fs.readdirSync(config.memoryRoot);
    expect(remaining).toHaveLength(0);
  });
});

describe("Memory - validatePath security", () => {
  it("rejects paths not starting with /memories", () => {
    expect(() => config.validatePath("/etc/passwd")).toThrow("must start with /memories");
  });

  it("rejects path traversal attempts", () => {
    expect(() =>
      config.validatePath("/memories/../../etc/passwd")
    ).toThrow();
  });
});
