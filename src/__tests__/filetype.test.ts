import { describe, expect, it } from "bun:test";
import { getFiletype } from "../utils/filetype.ts";

describe("getFiletype", () => {
  it("maps common extensions", () => {
    expect(getFiletype("main.ts")).toBe("typescript");
    expect(getFiletype("app.tsx")).toBe("typescript");
    expect(getFiletype("index.js")).toBe("javascript");
    expect(getFiletype("utils.py")).toBe("python");
    expect(getFiletype("lib.go")).toBe("go");
    expect(getFiletype("main.rs")).toBe("rust");
    expect(getFiletype("style.css")).toBe("css");
    expect(getFiletype("page.html")).toBe("html");
    expect(getFiletype("config.json")).toBe("json");
    expect(getFiletype("config.yaml")).toBe("yaml");
    expect(getFiletype("config.yml")).toBe("yaml");
    expect(getFiletype("config.toml")).toBe("toml");
    expect(getFiletype("script.sh")).toBe("bash");
    expect(getFiletype("query.sql")).toBe("sql");
  });

  it("handles paths with directories", () => {
    expect(getFiletype("src/utils/validate.py")).toBe("python");
    expect(getFiletype("deeply/nested/dir/file.ts")).toBe("typescript");
  });

  it("returns undefined for unknown extensions", () => {
    expect(getFiletype("file.xyz")).toBeUndefined();
    expect(getFiletype("file.png")).toBeUndefined();
  });

  it("returns undefined for files with no extension", () => {
    expect(getFiletype("Makefile")).toBeUndefined();
    expect(getFiletype("Dockerfile")).toBeUndefined();
  });

  it("is case-insensitive via toLowerCase", () => {
    expect(getFiletype("FILE.PY")).toBe("python");
    expect(getFiletype("App.TSX")).toBe("typescript");
  });

  it("uses last extension for dotted names", () => {
    expect(getFiletype("types.d.ts")).toBe("typescript");
    expect(getFiletype("data.test.js")).toBe("javascript");
  });
});
