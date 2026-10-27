import { describe, expect, it } from "vitest";
import { commit, redo, startHistory, undo } from "./edit-history";

describe("edit history", () => {
  it("undo goes back one step and redo returns", () => {
    let h = startHistory(0); h = commit(h, 1); h = commit(h, 2);
    h = undo(h); expect(h.present).toBe(1);
    h = undo(h); expect(h.present).toBe(0);
    h = redo(h); expect(h.present).toBe(1);
  });
  it("a new edit after undo clears redo", () => {
    let h = commit(startHistory(0), 1); h = undo(h); h = commit(h, 5);
    expect(h.future).toHaveLength(0); expect(redo(h).present).toBe(5);
  });
});
