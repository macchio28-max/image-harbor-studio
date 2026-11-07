import { androidShareWithPrompt } from "./android-share";

export type PromptTarget = { name: string; url: string; pkg: string };
export const PROMPT_TARGETS: PromptTarget[] = [
  { name: "ChatGPT", url: "https://chatgpt.com/", pkg: "com.openai.chatgpt" },
  { name: "Gemini", url: "https://gemini.google.com/", pkg: "com.google.android.apps.bard" },
  { name: "Meta AI", url: "https://www.meta.ai/", pkg: "com.facebook.stellar" },
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
    catch (error) { if (error instanceof Error && error.name === "AbortError") return "cancelled"; }
  }
  const result = await copyPhotoPrompt(text, png);
  const desktop = (window as Window & { lomaDesktop?: { openExternal: (url: string) => void } }).lomaDesktop;
  if (desktop?.openExternal) desktop.openExternal(target.url);
  else window.open(target.url, "_blank", "noopener");
  return result;
}