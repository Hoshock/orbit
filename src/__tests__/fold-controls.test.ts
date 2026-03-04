import { describe, expect, it } from "bun:test";
import {
  getExpandChunk,
  isFoldAllRequested,
  isKeybindingPressed,
} from "../data/fold-controls.ts";

describe("fold controls", () => {
  it("matches configured fold key regardless of raw/name casing", () => {
    expect(isKeybindingPressed({ name: "z" }, "z")).toBeTrue();
    expect(isKeybindingPressed({ raw: "Z" }, "z")).toBeTrue();
    expect(isKeybindingPressed({ name: "x", raw: "x" }, "z")).toBeFalse();
  });

  it("treats Shift+fold key as full fold request", () => {
    expect(isFoldAllRequested({ name: "z", shift: true }, "z")).toBeTrue();
    expect(isFoldAllRequested({ raw: "Z" }, "z")).toBeTrue();
    expect(isFoldAllRequested({ name: "z", raw: "z" }, "z")).toBeFalse();
    expect(isFoldAllRequested({ name: "x", shift: true }, "z")).toBeFalse();
  });

  it("uses incremental chunk by default and full chunk when requested", () => {
    expect(getExpandChunk(34, 0, 7, false)).toBe(7);
    expect(getExpandChunk(34, 30, 7, false)).toBe(4);
    expect(getExpandChunk(34, 0, 7, true)).toBe(34);
  });
});
