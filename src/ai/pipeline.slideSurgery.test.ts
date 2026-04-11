/**
 * Adversarial tests for the slide-surgery tools: split_slide and
 * merge_slides. Both tools move elements across slide boundaries but
 * previously dropped the animations and comments that pointed at
 * those elements, leaving orphaned references (animations with no
 * target, comments anchored to non-existent elements).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { executeTool } from "./pipeline";
import { useDeckStore } from "@/stores/deckStore";
import type { Deck, Slide, SlideElement, TextElement, Comment } from "@/types/deck";

// ── Fixtures ──

function text(id: string, content = `content-${id}`): TextElement {
  return {
    id,
    type: "text",
    content,
    position: { x: 0, y: 0 },
    size: { w: 100, h: 50 },
  } as TextElement;
}

function slide(id: string, elements: SlideElement[] = [], overrides: Partial<Slide> = {}): Slide {
  return { id, elements, ...overrides };
}

function deck(slides: Slide[]): Deck {
  return {
    version: "0.1.0",
    meta: { title: "Test", aspectRatio: "16:9" },
    slides,
  };
}

function loadDeck(d: Deck): void {
  useDeckStore.getState().openProject("test-slide-surgery", d);
}

function getDeck(): Deck {
  const d = useDeckStore.getState().deck;
  if (!d) throw new Error("No deck loaded in test");
  return d;
}

beforeEach(() => {
  useDeckStore.getState().closeProject();
});

// ─────────────────────────────────────────────────────────────────────
// split_slide — animation and comment routing
// ─────────────────────────────────────────────────────────────────────

describe("split_slide — animation routing", () => {
  it("keeps animations targeting elements that stay on the original slide", async () => {
    loadDeck(deck([
      slide("s1", [text("e1"), text("e2"), text("e3"), text("e4")], {
        animations: [
          { target: "e1", effect: "fadeIn", trigger: "onEnter" },
          { target: "e2", effect: "fadeIn", trigger: "onClick" },
        ],
      }),
    ]));

    // Split at e3 → [e1, e2] stay; [e3, e4] move to new slide
    await executeTool("split_slide", {
      slideId: "s1",
      pivotElementId: "e3",
      newSlideId: "s1-b",
    });

    const s1 = getDeck().slides.find((s) => s.id === "s1")!;
    expect(s1.animations).toBeDefined();
    expect(s1.animations).toHaveLength(2);
    expect(s1.animations![0]!.target).toBe("e1");
    expect(s1.animations![1]!.target).toBe("e2");
  });

  it("moves animations targeting the split-off elements to the new slide with remapped IDs", async () => {
    loadDeck(deck([
      slide("s1", [text("e1"), text("e2"), text("e3"), text("e4")], {
        animations: [
          { target: "e3", effect: "slideInLeft", trigger: "onEnter" },
          { target: "e4", effect: "fadeIn", trigger: "onClick" },
        ],
      }),
    ]));

    await executeTool("split_slide", {
      slideId: "s1",
      pivotElementId: "e3",
      newSlideId: "s1-b",
    });

    const s1 = getDeck().slides.find((s) => s.id === "s1")!;
    const s1b = getDeck().slides.find((s) => s.id === "s1-b")!;

    // No animations should remain on the original slide (both targeted
    // elements that moved)
    expect(s1.animations?.length ?? 0).toBe(0);

    // New slide should have both animations, retargeted to the new
    // (renamed) element IDs
    expect(s1b.animations).toBeDefined();
    expect(s1b.animations).toHaveLength(2);
    const newE3Id = s1b.elements[0]!.id;
    const newE4Id = s1b.elements[1]!.id;
    expect(s1b.animations![0]!.target).toBe(newE3Id);
    expect(s1b.animations![1]!.target).toBe(newE4Id);
  });

  it("splits animations correctly when some target kept elements and some target moved elements", async () => {
    loadDeck(deck([
      slide("s1", [text("e1"), text("e2"), text("e3")], {
        animations: [
          { target: "e1", effect: "fadeIn", trigger: "onEnter" },
          { target: "e3", effect: "slideInLeft", trigger: "onClick" },
          { target: "e2", effect: "fadeIn", trigger: "onClick" },
        ],
      }),
    ]));

    // Split at e3 → [e1, e2] kept, [e3] moved
    await executeTool("split_slide", {
      slideId: "s1",
      pivotElementId: "e3",
      newSlideId: "s1-b",
    });

    const s1 = getDeck().slides.find((s) => s.id === "s1")!;
    const s1b = getDeck().slides.find((s) => s.id === "s1-b")!;

    // e1 and e2 animations stay on s1
    expect(s1.animations?.map((a) => a.target).sort()).toEqual(["e1", "e2"]);
    // e3 animation moves to s1-b with new ID
    expect(s1b.animations).toHaveLength(1);
    expect(s1b.animations![0]!.target).toBe(s1b.elements[0]!.id);
  });

  it("routes comments to the slide containing their anchor element", async () => {
    loadDeck(deck([
      slide("s1", [text("e1"), text("e2"), text("e3")], {
        comments: [
          { id: "c1", elementId: "e1", text: "keep on original", createdAt: 1 } as Comment,
          { id: "c2", elementId: "e3", text: "follow the split", createdAt: 2 } as Comment,
          { id: "c3", text: "slide-level, no anchor", createdAt: 3 } as Comment,
        ],
      }),
    ]));

    await executeTool("split_slide", {
      slideId: "s1",
      pivotElementId: "e3",
      newSlideId: "s1-b",
    });

    const s1 = getDeck().slides.find((s) => s.id === "s1")!;
    const s1b = getDeck().slides.find((s) => s.id === "s1-b")!;

    // c1 anchored to e1 (stays) → stays on s1
    expect(s1.comments?.some((c) => c.id === "c1")).toBe(true);
    // c3 slide-level → stays on source
    expect(s1.comments?.some((c) => c.id === "c3")).toBe(true);
    // c2 anchored to e3 (moved) → should be on s1-b with remapped elementId
    expect(s1b.comments?.some((c) => c.id === "c2")).toBe(true);
    const movedComment = s1b.comments!.find((c) => c.id === "c2")!;
    expect(movedComment.elementId).toBe(s1b.elements[0]!.id);
  });
});

// ─────────────────────────────────────────────────────────────────────
// merge_slides — animation and comment aggregation
// ─────────────────────────────────────────────────────────────────────

describe("merge_slides — animation aggregation", () => {
  it("preserves source slide animations by remapping their targets to merged element IDs", async () => {
    loadDeck(deck([
      slide("target", [text("t-e1")], {
        animations: [
          { target: "t-e1", effect: "fadeIn", trigger: "onEnter" },
        ],
      }),
      slide("source", [text("s-e1"), text("s-e2")], {
        animations: [
          { target: "s-e1", effect: "slideInLeft", trigger: "onClick" },
          { target: "s-e2", effect: "fadeIn", trigger: "onClick" },
        ],
      }),
    ]));

    await executeTool("merge_slides", {
      targetSlideId: "target",
      sourceSlideIds: ["source"],
    });

    const merged = getDeck().slides.find((s) => s.id === "target")!;
    expect(merged.animations).toBeDefined();
    // One target animation + two source animations = 3 total
    expect(merged.animations).toHaveLength(3);

    // Target's original animation untouched
    expect(merged.animations!.some((a) => a.target === "t-e1")).toBe(true);

    // Source animations should point at the renamed (disambiguated)
    // element IDs. The source elements were renamed to something like
    // "s-e1_from_source". Verify by looking them up in merged.elements.
    const mergedIds = merged.elements.map((e) => e.id);
    const sourceE1NewId = mergedIds.find((id) => id.startsWith("s-e1"));
    const sourceE2NewId = mergedIds.find((id) => id.startsWith("s-e2"));
    expect(sourceE1NewId).toBeDefined();
    expect(sourceE2NewId).toBeDefined();
    expect(merged.animations!.some((a) => a.target === sourceE1NewId)).toBe(true);
    expect(merged.animations!.some((a) => a.target === sourceE2NewId)).toBe(true);
  });

  it("preserves source slide comments by remapping their elementId anchors", async () => {
    loadDeck(deck([
      slide("target", [text("t-e1")], {
        comments: [
          { id: "target-c1", elementId: "t-e1", text: "target comment", createdAt: 1 } as Comment,
        ],
      }),
      slide("source", [text("s-e1")], {
        comments: [
          { id: "source-c1", elementId: "s-e1", text: "source comment", createdAt: 2 } as Comment,
        ],
      }),
    ]));

    await executeTool("merge_slides", {
      targetSlideId: "target",
      sourceSlideIds: ["source"],
    });

    const merged = getDeck().slides.find((s) => s.id === "target")!;
    expect(merged.comments?.some((c) => c.id === "target-c1")).toBe(true);
    expect(merged.comments?.some((c) => c.id === "source-c1")).toBe(true);

    const sourceComment = merged.comments!.find((c) => c.id === "source-c1")!;
    // elementId should now point at the renamed element
    const renamedSourceEl = merged.elements.find((e) => e.id.startsWith("s-e1"));
    expect(renamedSourceEl).toBeDefined();
    expect(sourceComment.elementId).toBe(renamedSourceEl!.id);
  });

  it("handles merging when target has no prior animations", async () => {
    loadDeck(deck([
      slide("target", [text("t-e1")]),
      slide("source", [text("s-e1")], {
        animations: [{ target: "s-e1", effect: "fadeIn", trigger: "onClick" }],
      }),
    ]));

    await executeTool("merge_slides", {
      targetSlideId: "target",
      sourceSlideIds: ["source"],
    });

    const merged = getDeck().slides.find((s) => s.id === "target")!;
    expect(merged.animations).toBeDefined();
    expect(merged.animations).toHaveLength(1);
    const renamedEl = merged.elements.find((e) => e.id.startsWith("s-e1"))!;
    expect(merged.animations![0]!.target).toBe(renamedEl.id);
  });

  it("aggregates animations from multiple source slides", async () => {
    loadDeck(deck([
      slide("target", [text("t-e1")]),
      slide("srcA", [text("a1")], {
        animations: [{ target: "a1", effect: "fadeIn", trigger: "onClick" }],
      }),
      slide("srcB", [text("b1")], {
        animations: [{ target: "b1", effect: "slideInLeft", trigger: "onClick" }],
      }),
    ]));

    await executeTool("merge_slides", {
      targetSlideId: "target",
      sourceSlideIds: ["srcA", "srcB"],
    });

    const merged = getDeck().slides.find((s) => s.id === "target")!;
    expect(merged.animations).toHaveLength(2);
  });
});
