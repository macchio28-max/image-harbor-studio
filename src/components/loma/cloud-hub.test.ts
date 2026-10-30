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

import { parseOneDriveFolder } from "./onedrive";
describe("parseOneDriveFolder", () => {
  it("accepts share links, paths and item IDs", () => {
    expect(parseOneDriveFolder("https://1drv.ms/f/s!AbcDEF")).toBe("https://1drv.ms/f/s!AbcDEF");
    expect(parseOneDriveFolder("/Foto/Lavorati/")).toBe("/Foto/Lavorati");
    expect(parseOneDriveFolder("ABC123!456")).toBe("ABC123!456");
    expect(parseOneDriveFolder("https://example.com/x")).toBe("");
  });
});

import { parseDropboxFolder } from "./dropbox";
describe("parseDropboxFolder", () => {
  it("accepts paths, root and home links", () => {
    expect(parseDropboxFolder("/Foto/Viaggio/")).toBe("/Foto/Viaggio");
    expect(parseDropboxFolder("")).toBe("/");
    expect(parseDropboxFolder("https://www.dropbox.com/home/Foto%20Lavori")).toBe("/Foto Lavori");
    expect(parseDropboxFolder("ciao")).toBe("");
  });
});
