import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addDefaultParsers } from "@opentui/core";
import jsonHighlights from "../assets/tree-sitter/json/highlights.scm" with {
  type: "file",
};
import jsonWasm from "../assets/tree-sitter/json/tree-sitter-json.wasm" with {
  type: "file",
};
import pythonHighlights from "../assets/tree-sitter/python/highlights.scm" with {
  type: "file",
};
import pythonWasm from "../assets/tree-sitter/python/tree-sitter-python.wasm" with {
  type: "file",
};
import tomlHighlights from "../assets/tree-sitter/toml/highlights.scm" with {
  type: "file",
};
import tomlWasm from "../assets/tree-sitter/toml/tree-sitter-toml.wasm" with {
  type: "file",
};
import yamlHighlights from "../assets/tree-sitter/yaml/highlights.scm" with {
  type: "file",
};
import yamlWasm from "../assets/tree-sitter/yaml/tree-sitter-yaml.wasm" with {
  type: "file",
};

const __dir = dirname(fileURLToPath(import.meta.url));

export const CUSTOM_SYNTAX_FILETYPES = [
  "python",
  "json",
  "toml",
  "yaml",
] as const;

export function registerSyntaxParsers() {
  addDefaultParsers([
    {
      filetype: "python",
      wasm: resolve(__dir, pythonWasm),
      queries: { highlights: [resolve(__dir, pythonHighlights)] },
    },
    {
      filetype: "json",
      wasm: resolve(__dir, jsonWasm),
      queries: { highlights: [resolve(__dir, jsonHighlights)] },
    },
    {
      filetype: "toml",
      wasm: resolve(__dir, tomlWasm),
      queries: { highlights: [resolve(__dir, tomlHighlights)] },
    },
    {
      filetype: "yaml",
      wasm: resolve(__dir, yamlWasm),
      queries: { highlights: [resolve(__dir, yamlHighlights)] },
    },
  ]);
}
