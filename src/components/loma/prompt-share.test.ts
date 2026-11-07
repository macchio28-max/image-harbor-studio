import { describe, expect, it, vi, afterEach } from "vitest";
import { copyPhotoPrompt, promptShareData, sendPhotoPrompt, PROMPT_TARGETS } from "./prompt-share";

afterEach(() => vi.unstubAllGlobals());
describe("external prompt sharing", () => {
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