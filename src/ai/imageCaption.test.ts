/**
 * Tests for the pure helper in imageCaption.ts.
 *
 * The caption pipeline wraps a Gemini multimodal call with retry/backoff
 * logic. The retry decision is driven by isTransientError, which classifies
 * the error by inspecting its message for known HTTP status codes and
 * network error patterns. Unit-testing the classifier is the high-ROI
 * slice — the full retry loop requires mocking callGemini and fake timers,
 * which is covered at a higher level.
 */
import { describe, it, expect } from "vitest";
import { isTransientError } from "./imageCaption";

describe("isTransientError", () => {
  it("treats 429 rate limit as transient", () => {
    expect(isTransientError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
  });

  it("treats 500 internal error as transient", () => {
    expect(isTransientError(new Error("HTTP 500 Internal Server Error"))).toBe(true);
  });

  it("treats 502 bad gateway as transient", () => {
    expect(isTransientError(new Error("502 Bad Gateway"))).toBe(true);
  });

  it("treats 503 service unavailable as transient", () => {
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("treats 504 gateway timeout as transient", () => {
    expect(isTransientError(new Error("504 Gateway Timeout"))).toBe(true);
  });

  it("treats 'network' keyword as transient (case insensitive)", () => {
    expect(isTransientError(new Error("Network request failed"))).toBe(true);
    expect(isTransientError(new Error("NETWORK down"))).toBe(true);
  });

  it("treats 'fetch' keyword as transient", () => {
    expect(isTransientError(new Error("Failed to fetch"))).toBe(true);
  });

  it("treats 'timeout' keyword as transient", () => {
    expect(isTransientError(new Error("Request timeout"))).toBe(true);
  });

  it("treats ECONNRESET as transient", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
  });

  it("treats ETIMEDOUT as transient", () => {
    expect(isTransientError(new Error("connect ETIMEDOUT 1.2.3.4:443"))).toBe(true);
  });

  it("treats 400 bad request as permanent", () => {
    expect(isTransientError(new Error("HTTP 400 Bad Request"))).toBe(false);
  });

  it("treats 401 unauthorized as permanent", () => {
    expect(isTransientError(new Error("HTTP 401 Unauthorized"))).toBe(false);
  });

  it("treats 403 forbidden as permanent", () => {
    expect(isTransientError(new Error("HTTP 403 Forbidden"))).toBe(false);
  });

  it("treats 404 not found as permanent", () => {
    expect(isTransientError(new Error("HTTP 404 Not Found"))).toBe(false);
  });

  it("treats unknown error strings as permanent by default", () => {
    expect(isTransientError(new Error("schema validation failed"))).toBe(false);
  });

  it("handles non-Error values by coercing to string", () => {
    expect(isTransientError("network collapse")).toBe(true);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError({ foo: "bar" })).toBe(false);
  });

  it("matches 429 only when it is a full number, not a substring of a longer digit sequence", () => {
    // Current implementation uses \b(429|500|...) which respects word boundaries.
    // "x4290y" should not match 429.
    expect(isTransientError(new Error("x4290 unrelated"))).toBe(false);
  });
});
