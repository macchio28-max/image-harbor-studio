import { describe, expect, it } from "vitest";
import { photoFolder, removeComparePhoto, type CompareItem } from "./compare-collection";

const item = (id: string): CompareItem => ({ id, file: new File([id], `${id}.jpg`), folder: id.startsWith("dx") ? "1Dx" : "R6", thumb: null, rating: 0, locked: false, flagged: false });
describe("independent comparison collections", () => {
  it("closes only the blurred 1Dx photo while retaining its sibling and both R6 photos", () => {
    const a = [item("dx1"), item("dx2")], b = [item("r61"), item("r62")];
    const next = removeComparePhoto(a, "dx1", "dx1");
    expect(next.items.map(photo => photo.id)).toEqual(["dx2"]);
    expect(next.current).toBe("dx2");
    expect(b.map(photo => photo.id)).toEqual(["r61", "r62"]);
    expect([...next.items, item("dx3")].map(photo => photo.id)).toEqual(["dx2", "dx3"]);
  });
  it("keeps the current photo when another is closed and empties only the last-photo pane", () => {
    expect(removeComparePhoto([item("dx1"), item("dx2")], "dx1", "dx2").current).toBe("dx1");
    expect(removeComparePhoto([item("dx1")], "dx1", "dx1")).toEqual({ items: [], current: null });
  });
  it("retains imported folder paths instead of grouping same-name photos together", () => {
    const file = new File(["x"], "photo.jpg");
    Object.defineProperty(file, "webkitRelativePath", { value: "1Dx/DCIM/photo.jpg" });
    expect(photoFolder(file, "Immagini")).toBe("1Dx/DCIM");
    expect(photoFolder(new File(["x"], "photo.jpg"), "R6")).toBe("R6");
  });
});