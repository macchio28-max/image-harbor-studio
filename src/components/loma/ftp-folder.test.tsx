import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FtpDialog } from "./FtpDialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type NativeWindow = typeof window & {
  LomaAndroid?: unknown;
  __lomaOnFolderPicked?: (display: string, error?: string) => void;
};
const win = window as NativeWindow;
const internal = "Memoria interna / Immagini / LoMa FTP";
const sd = "Scheda SD / Foto";
let saved: string;
let native: { ftpStart: ReturnType<typeof vi.fn>; ftpStatus: ReturnType<typeof vi.fn>; ftpLogs: ReturnType<typeof vi.fn>; pickFolder: ReturnType<typeof vi.fn>; resetFolder: ReturnType<typeof vi.fn> };
const open = (running = false) => render(<FtpDialog onClose={vi.fn()} onReceived={vi.fn()} onImport={vi.fn()} hasImage={false} count={0} makeFiles={async () => []} running={running} setRunning={vi.fn()} />);

beforeEach(() => {
  localStorage.clear();
  saved = sd;
  native = {
    ftpStart: vi.fn(),
    ftpStatus: vi.fn(() => JSON.stringify({ running: false, dir: saved })),
    ftpLogs: vi.fn(() => "[]"),
    pickFolder: vi.fn(),
    resetFolder: vi.fn(() => { saved = internal; win.__lomaOnFolderPicked?.(saved); }),
  };
  win.LomaAndroid = native;
});
afterEach(() => { cleanup(); delete win.LomaAndroid; delete win.__lomaOnFolderPicked; });

describe("Android FTP destination", () => {
  it("reads the native destination on every dialog opening, not the desktop setting", () => {
    localStorage.setItem("loma.ftp.receiver", JSON.stringify({ port: 2121, user: "loma", pass: "test", dir: "/desktop" }));
    const first = open();
    expect(screen.getByLabelText("Cartella di destinazione").textContent).toBe(sd);
    first.unmount();
    saved = "Memoria interna / Foto";
    open();
    expect(screen.getByLabelText("Cartella di destinazione").textContent).toBe("Memoria interna / Foto");
  });
  it("opens the native picker and accepts its chosen SD destination without changing receiver credentials", () => {
    open();
    const credentials = localStorage.getItem("loma.ftp.receiver");
    fireEvent.click(screen.getByRole("button", { name: "Sfoglia…" }));
    expect(native.pickFolder).toHaveBeenCalledTimes(1);
    act(() => win.__lomaOnFolderPicked?.("Scheda SD / Fotocamera"));
    expect(screen.getByLabelText("Cartella di destinazione").textContent).toBe("Scheda SD / Fotocamera");
    expect(localStorage.getItem("loma.ftp.receiver")).toBe(credentials);
  });
  it("resets through the native bridge and reads the default again after reopening", async () => {
    const first = open();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina cartella predefinita" }));
    expect(native.resetFolder).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Cartella di destinazione").textContent).toBe(internal);
    first.unmount();
    open();
    expect(screen.getByLabelText("Cartella di destinazione").textContent).toBe(internal);
  });
  it("does not change the destination if the picker fails or is cancelled", () => {
    open();
    act(() => win.__lomaOnFolderPicked?.("", "Permesso negato"));
    expect(screen.getByLabelText("Cartella di destinazione").textContent).toBe(sd);
    act(() => win.__lomaOnFolderPicked?.(""));
    expect(screen.getByLabelText("Cartella di destinazione").textContent).toBe(sd);
  });
  it("prevents destination changes during reception and removes the callback when closed", () => {
    const dialog = open(true);
    fireEvent.click(screen.getByRole("button", { name: "Sfoglia…" }));
    fireEvent.click(screen.getByRole("button", { name: "Ripristina cartella predefinita" }));
    expect(native.pickFolder).not.toHaveBeenCalled();
    expect(native.resetFolder).not.toHaveBeenCalled();
    dialog.unmount();
    expect(win.__lomaOnFolderPicked).toBeUndefined();
  });
});