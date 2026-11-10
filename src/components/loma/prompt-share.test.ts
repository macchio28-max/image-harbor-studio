import { describe, expect, it, vi, afterEach } from "vitest";
import { copyPhotoPrompt, promptShareData, sendPhotoPrompt, PROMPT_TARGETS } from "./prompt-share";

afterEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (window as Window & { lomaDesktop?: unknown }).lomaDesktop;
  delete (window as Window & { LomaAndroid?: unknown }).LomaAndroid;
});
describe("external prompt sharing", () => {
  it("keeps only the full-resolution photo in the clipboard and the full ChatGPT prompt in the link", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    vi.stubGlobal("ClipboardItem", class { constructor(public data: Record<string, unknown>) {} });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const photo = new File(["full-resolution-png"], "photo.png", { type: "image/png" });
    const target = PROMPT_TARGETS[0];
    if (!target) throw new Error("Missing target");
    expect(await sendPhotoPrompt(target, "Intero prompt\nFINE", photo, async () => photo)).toBe("prefill");
    const item = write.mock.calls[0]?.[0]?.[0];
    expect(Object.keys(item.data)).toEqual(["image/png"]);
    expect(await item.data["image/png"]).toBe(photo);
    expect(writeText).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(target.prefill + encodeURIComponent("Intero prompt\nFINE"), "_blank", "noopener");
  });
  it("never replaces the clipboard with a long prompt when photo copying fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn().mockRejectedValue(new Error("Denied")), writeText } });
    vi.stubGlobal("ClipboardItem", class { constructor(public data: unknown) {} });
    vi.spyOn(window, "open").mockReturnValue(null);
    const target = PROMPT_TARGETS[0];
    if (!target) throw new Error("Missing target");
    const photo = new File(["png"], "photo.png", { type: "image/png" });
    expect(await sendPhotoPrompt(target, "L".repeat(7000), photo, async () => photo)).toBe("copy-failed");
    expect(writeText).not.toHaveBeenCalled();
  });
  it("uses native desktop image copying without adding clipboard text", async () => {
    const copyImage = vi.fn().mockResolvedValue(true);
    const openExternal = vi.fn();
    const writeText = vi.fn();
    Object.assign(window, { lomaDesktop: { copyImage, openExternal } });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const target = PROMPT_TARGETS[0];
    if (!target) throw new Error("Missing target");
    const photo = new File(["png"], "photo.png", { type: "image/png" });
    expect(await sendPhotoPrompt(target, "PROMPT", photo, async () => photo)).toBe("prefill");
    expect(copyImage).toHaveBeenCalledWith(photo);
    expect(writeText).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith(target.prefill + "PROMPT");
  });
  it("passes the full selected prompt and photo together without truncating long text", () => {
    const file = new File(["image"], "bird.jpg", { type: "image/jpeg" });
    const text = "Recupero selettivo\n".repeat(1000) + "FINE";
    expect(promptShareData(file, text)).toEqual({ files: [file], text, title: "LoMa Prompt" });
  });
  it("copies photo and full text in one clipboard item", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal("ClipboardItem", class { constructor(public data: unknown) {} });
    const file = new File(["png"], "bird.png", { type: "image/png" });
    expect(await copyPhotoPrompt("Tutto il prompt\nFINE", async () => file)).toBe("both");
    const item = write.mock.calls[0]?.[0]?.[0];
    expect(item.data["text/plain"].size).toBe(new Blob(["Tutto il prompt\nFINE"]).size);
    expect(await item.data["image/png"]).toBe(file);
  });
  it("shares the original JPEG with native EXTRA_TEXT without canvas conversion", async () => {
    const commit = vi.fn().mockReturnValue(true);
    Object.assign(window, { LomaAndroid: { shareBegin: () => "p1", shareChunk: () => true, shareCommitPrompt: commit } });
    const file = new File(["jpeg"], "bird.jpg", { type: "image/jpeg" });
    const target = PROMPT_TARGETS[0];
    if (!target) throw new Error("Missing target");
    expect(await sendPhotoPrompt(target, "INTERO\nPROMPT", file)).toBe("native");
    expect(commit).toHaveBeenCalledWith("p1", "com.openai.chatgpt", "INTERO\nPROMPT");
    delete (window as Window & { LomaAndroid?: unknown }).LomaAndroid;
  });
  it("does not open another app after a cancelled system share", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")) });
    const open = vi.spyOn(window, "open");
    const target = PROMPT_TARGETS[1];
    if (!target) throw new Error("Missing target");
    expect(await sendPhotoPrompt(target, "prompt", new File(["x"], "x.png"))).toBe("cancelled");
    expect(open).not.toHaveBeenCalled(); open.mockRestore();
  });
});