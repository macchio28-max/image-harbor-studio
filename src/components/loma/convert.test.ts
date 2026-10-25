import { describe, it, expect } from "vitest";
import { scaledSize, EXT } from "./convert";
describe("convert", () => {
  it("scales 6000x4000 to 50%", () => expect(scaledSize(6000, 4000, 0.5)).toEqual({ w: 3000, h: 2000 }));
  it("scales to 25%", () => expect(scaledSize(6000, 4000, 0.25)).toEqual({ w: 1500, h: 1000 }));
  it("JPEG uses .jpg", () => expect(EXT.jpeg).toBe("jpg"));
});
