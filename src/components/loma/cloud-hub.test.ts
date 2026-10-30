import { describe, it, expect } from "vitest";
import { parseFolderId } from "./cloud-hub";

describe("parseFolderId", () => {
  it("reads the ID from a Drive folder link", () => {
    expect(parseFolderId("https://drive.google.com/drive/folders/1AbC_def-GHIjkl?usp=sharing")).toBe("1AbC_def-GHIjkl");
  });
  it("reads open?id= links", () => {
    expect(parseFolderId("https://drive.google.com/open?id=1XyZ0123456789")).toBe("1XyZ0123456789");
  });
  it("accepts a bare ID and rejects garbage", () => {
    expect(parseFolderId("1XyZ0123456789")).toBe("1XyZ0123456789");
    expect(parseFolderId("ciao")).toBe("");
  });
});
