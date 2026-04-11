/**
 * Tests for the pure helpers in imageDownscale.ts.
 *
 * Canvas and IndexedDB paths are browser-only and covered by integration
 * checks instead of unit tests. The pure geometry + cache-key logic here
 * is the decision core that determines output dimensions and cache hits,
 * so unit-testing it is high ROI.
 */
import { describe, it, expect } from "vitest";
import { computeTargetSize, cacheKey } from "./imageDownscale";

describe("computeTargetSize", () => {
  it("returns the original size when the long edge fits under the limit", () => {
    expect(computeTargetSize(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it("returns the original size when the long edge exactly equals the limit", () => {
    expect(computeTargetSize(1280, 720, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it("scales a landscape image so the wide edge matches the limit", () => {
    // 4000 → 1280, scale = 0.32, height 3000 → 960
    expect(computeTargetSize(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it("scales a portrait image so the tall edge matches the limit", () => {
    // 3000 → 1280 (on the tall edge), scale = 1280/3000, width 2000 → 853
    expect(computeTargetSize(2000, 3000, 1280)).toEqual({ width: 853, height: 1280 });
  });

  it("scales a square image proportionally", () => {
    expect(computeTargetSize(2000, 2000, 1000)).toEqual({ width: 1000, height: 1000 });
  });

  it("rounds sub-pixel results to the nearest integer", () => {
    // 1500 → 1280, scale = 1280/1500 = 0.8533..., 1500*0.8533 = 1279.95 → 1280 or 1279
    // Verifying there's no non-integer output, exact values depend on rounding.
    const result = computeTargetSize(1500, 1500, 1280);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
    expect(result.width).toBeCloseTo(1280, 0);
    expect(result.height).toBeCloseTo(1280, 0);
  });

  it("handles tiny images without underflow", () => {
    expect(computeTargetSize(10, 10, 768)).toEqual({ width: 10, height: 10 });
  });

  it("handles a small max edge that requires downscaling", () => {
    // 1000 long edge, max 100 → scale 0.1 → 100 x 50
    expect(computeTargetSize(1000, 500, 100)).toEqual({ width: 100, height: 50 });
  });
});

describe("cacheKey", () => {
  const defaultOpts = { maxLongEdge: 1280, format: "webp" as const, quality: 0.85 };

  it("returns a deterministic key for identical inputs", () => {
    const a = cacheKey("./img.png", defaultOpts);
    const b = cacheKey("./img.png", defaultOpts);
    expect(a).toBe(b);
  });

  it("includes the src in the key", () => {
    expect(cacheKey("./a.png", defaultOpts)).not.toBe(cacheKey("./b.png", defaultOpts));
  });

  it("distinguishes different maxLongEdge values", () => {
    const k1 = cacheKey("./img.png", { ...defaultOpts, maxLongEdge: 1280 });
    const k2 = cacheKey("./img.png", { ...defaultOpts, maxLongEdge: 768 });
    expect(k1).not.toBe(k2);
  });

  it("distinguishes different formats", () => {
    const webp = cacheKey("./img.png", { ...defaultOpts, format: "webp" });
    const jpeg = cacheKey("./img.png", { ...defaultOpts, format: "jpeg" });
    expect(webp).not.toBe(jpeg);
  });

  it("distinguishes different quality values", () => {
    const high = cacheKey("./img.png", { ...defaultOpts, quality: 0.95 });
    const low = cacheKey("./img.png", { ...defaultOpts, quality: 0.6 });
    expect(high).not.toBe(low);
  });

  it("does not leak opts object identity (uses values)", () => {
    const opts1 = { maxLongEdge: 1280, format: "webp" as const, quality: 0.85 };
    const opts2 = { maxLongEdge: 1280, format: "webp" as const, quality: 0.85 };
    expect(cacheKey("./img.png", opts1)).toBe(cacheKey("./img.png", opts2));
  });
});
