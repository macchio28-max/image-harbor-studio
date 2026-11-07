import { androidShareWithPrompt } from "./android-share";

export type PromptTarget = { name: string; url: string; pkg: string; prefill?: string };
export const PROMPT_TARGETS: PromptTarget[] = [
  { name: "ChatGPT", url: "https://chatgpt.com/", pkg: "com.openai.chatgpt", prefill: "https://chatgpt.com/?q=" },
  { name: "Gemini", url: "https://gemini.google.com/", pkg: "com.google.android.apps.bard" },
  { name: "Meta AI", url: "https://www.meta.ai/", pkg: "com.facebook.stella" },
];

export function promptShareData(file: File, text: string): ShareData {
  return { files: [file], text, title: "LoMa Prompt" };
}

export async function copyPhotoPrompt(text: string, png?: () => Promise<File>): Promise<"both" | "text"> {
  if (png && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "image/png": png().then(file => file as Blob),
      })]);
      return "both";
    } catch { /* browser may accept text only */ }
  }
  await navigator.clipboard.writeText(text);
  return "text";
}

export async function sendPhotoPrompt(target: PromptTarget, text: string, file: File | null, png?: () => Promise<File>) {
  if (file && await androidShareWithPrompt(file, text, target.pkg)) return "native";
  // An older APK cannot attach EXTRA_TEXT: do not silently send the photo without the prompt.
  if (file && !(window as Window & { LomaAndroid?: unknown }).LomaAndroid && navigator.canShare?.(promptShareData(file, text))) {
    try { await navigator.share(promptShareData(file, text)); return "shared"; }
    catch (error) { if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") return "cancelled"; }
  }
  // Chat apps paste text instead of the image when both share one clipboard item:
  // put only the photo on the clipboard and deliver the prompt separately.
  let result: "image" | "text" | "prefill" = "text";
  if (png && typeof ClipboardItem !== "undefined") {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": png().then(f => f as Blob) })]); result = "image"; } catch { /* text only */ }
  }
  const url = target.prefill && text.trim() && text.length < 6000 ? target.prefill + encodeURIComponent(text) : target.url;
  if (result === "image" && url !== target.url) result = "prefill";
  if (result === "text") await navigator.clipboard.writeText(text);
  const desktop = (window as Window & { lomaDesktop?: { openExternal: (url: string) => void } }).lomaDesktop;
  if (desktop?.openExternal) desktop.openExternal(url);
  else window.open(url, "_blank", "noopener");
  return result;
}
