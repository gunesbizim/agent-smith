import { describe, expect, it } from "vitest";
import { extractJson } from "../../engine/parse.js";

describe("extractJson", () => {
  it("parses a bare object and a bare array directly", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("extracts JSON from a ```json fence", () => {
    expect(extractJson('prose\n```json\n{"x":true}\n```\nmore')).toEqual({ x: true });
  });

  it("slices an object out of surrounding prose", () => {
    expect(extractJson('Here it is: {"k":"v"} thanks')).toEqual({ k: "v" });
  });

  it("slices a leading array out of prose without mistaking it for an object", () => {
    expect(extractJson('result: [{"k":1}]')).toEqual([{ k: 1 }]);
  });

  it("returns null for null and for unparseable text", () => {
    expect(extractJson(null)).toBeNull();
    expect(extractJson("no json here")).toBeNull();
  });
});
