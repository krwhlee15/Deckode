/**
 * Tests for the localStorage-backed user settings in geminiClient.ts:
 * Gemini API key, agent model selection, auto-caption-on-upload flag.
 *
 * Each getter implements a one-time migration from its pre-rebrand
 * "deckode:*" key to the new "tekkal:*" key. These tests verify the
 * migration runs exactly once, respects existing new-key values, and
 * cleans up the legacy entry after copying.
 *
 * We stub localStorage with an in-memory Map so the tests run under
 * vitest's default node environment without pulling in jsdom.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ── In-memory localStorage stub ──
// Defined before importing the module under test so the top-level imports
// in geminiClient.ts see the stubbed global.

const store = new Map<string, string>();
const stub: Storage = {
  get length() { return store.size; },
  clear: () => store.clear(),
  getItem: (k) => (store.has(k) ? store.get(k)! : null),
  key: (i) => [...store.keys()][i] ?? null,
  removeItem: (k) => { store.delete(k); },
  setItem: (k, v) => { store.set(k, String(v)); },
};
(globalThis as unknown as { localStorage: Storage }).localStorage = stub;

// Import after the stub is installed
const {
  getApiKey, setApiKey, clearApiKey,
  getAgentModels, setAgentModel,
  getAutoCaptionOnUpload, setAutoCaptionOnUpload,
  DEFAULT_AGENT_MODELS,
} = await import("./geminiClient");

beforeEach(() => {
  store.clear();
});

// ─────────────────────────────────────────────────────────────────────
// API key
// ─────────────────────────────────────────────────────────────────────

describe("geminiClient — API key storage and migration", () => {
  it("returns null when neither key is set", () => {
    expect(getApiKey()).toBeNull();
  });

  it("reads from the canonical tekkal key when present", () => {
    store.set("tekkal:gemini-api-key", "new-key");
    expect(getApiKey()).toBe("new-key");
  });

  it("migrates from the legacy deckode key on first read", () => {
    store.set("deckode:gemini-api-key", "legacy-key");
    const first = getApiKey();
    expect(first).toBe("legacy-key");
    // After migration, the new key holds the value and the legacy key is gone
    expect(store.get("tekkal:gemini-api-key")).toBe("legacy-key");
    expect(store.has("deckode:gemini-api-key")).toBe(false);
    // Second read still returns the value, now from the new key
    expect(getApiKey()).toBe("legacy-key");
  });

  it("prefers the canonical key when both are set", () => {
    store.set("tekkal:gemini-api-key", "new");
    store.set("deckode:gemini-api-key", "old");
    expect(getApiKey()).toBe("new");
    // Legacy key should be left alone — it's only touched on actual migration
    expect(store.get("deckode:gemini-api-key")).toBe("old");
  });

  it("setApiKey writes the new key and clears legacy", () => {
    store.set("deckode:gemini-api-key", "old");
    setApiKey("fresh");
    expect(store.get("tekkal:gemini-api-key")).toBe("fresh");
    expect(store.has("deckode:gemini-api-key")).toBe(false);
  });

  it("clearApiKey removes both new and legacy keys", () => {
    store.set("tekkal:gemini-api-key", "new");
    store.set("deckode:gemini-api-key", "old");
    clearApiKey();
    expect(store.has("tekkal:gemini-api-key")).toBe(false);
    expect(store.has("deckode:gemini-api-key")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Agent models
// ─────────────────────────────────────────────────────────────────────

describe("geminiClient — agent model storage and migration", () => {
  it("returns defaults when nothing is stored", () => {
    expect(getAgentModels()).toEqual(DEFAULT_AGENT_MODELS);
  });

  it("returns stored values merged over defaults", () => {
    store.set(
      "tekkal:agent-models",
      JSON.stringify({ planner: "gemini-2.5-pro" }),
    );
    const models = getAgentModels();
    expect(models.planner).toBe("gemini-2.5-pro");
    // Unspecified roles fall back to defaults
    expect(models.generator).toBe(DEFAULT_AGENT_MODELS.generator);
  });

  it("migrates the legacy deckode key on first read", () => {
    store.set(
      "deckode:agent-models",
      JSON.stringify({ reviewer: "gemini-2.5-pro" }),
    );
    const models = getAgentModels();
    expect(models.reviewer).toBe("gemini-2.5-pro");
    expect(store.get("tekkal:agent-models")).toBe(
      JSON.stringify({ reviewer: "gemini-2.5-pro" }),
    );
    expect(store.has("deckode:agent-models")).toBe(false);
  });

  it("falls back to defaults on corrupt JSON", () => {
    store.set("tekkal:agent-models", "not valid json {{{");
    expect(getAgentModels()).toEqual(DEFAULT_AGENT_MODELS);
  });

  it("setAgentModel writes the merged object and clears legacy", () => {
    store.set(
      "deckode:agent-models",
      JSON.stringify({ planner: "old-model" }),
    );
    setAgentModel("writer", "gemini-2.5-pro");
    const saved = JSON.parse(store.get("tekkal:agent-models")!);
    expect(saved.writer).toBe("gemini-2.5-pro");
    expect(store.has("deckode:agent-models")).toBe(false);
  });

  it("prefers the new key when both exist", () => {
    store.set("tekkal:agent-models", JSON.stringify({ planner: "new" }));
    store.set("deckode:agent-models", JSON.stringify({ planner: "old" }));
    expect(getAgentModels().planner).toBe("new");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Auto-caption flag
// ─────────────────────────────────────────────────────────────────────

describe("geminiClient — auto-caption flag storage and migration", () => {
  it("defaults to false when nothing is stored", () => {
    expect(getAutoCaptionOnUpload()).toBe(false);
  });

  it("reads true from the canonical tekkal key", () => {
    store.set("tekkal:auto-caption-on-upload", "true");
    expect(getAutoCaptionOnUpload()).toBe(true);
  });

  it("reads false from the canonical key", () => {
    store.set("tekkal:auto-caption-on-upload", "false");
    expect(getAutoCaptionOnUpload()).toBe(false);
  });

  it("migrates the legacy deckode key", () => {
    store.set("deckode:auto-caption-on-upload", "true");
    expect(getAutoCaptionOnUpload()).toBe(true);
    expect(store.get("tekkal:auto-caption-on-upload")).toBe("true");
    expect(store.has("deckode:auto-caption-on-upload")).toBe(false);
  });

  it("setAutoCaptionOnUpload writes stringified boolean and clears legacy", () => {
    store.set("deckode:auto-caption-on-upload", "true");
    setAutoCaptionOnUpload(false);
    expect(store.get("tekkal:auto-caption-on-upload")).toBe("false");
    expect(store.has("deckode:auto-caption-on-upload")).toBe(false);
    setAutoCaptionOnUpload(true);
    expect(store.get("tekkal:auto-caption-on-upload")).toBe("true");
  });

  it("any value other than literal 'true' reads as false", () => {
    store.set("tekkal:auto-caption-on-upload", "yes");
    expect(getAutoCaptionOnUpload()).toBe(false);
    store.set("tekkal:auto-caption-on-upload", "1");
    expect(getAutoCaptionOnUpload()).toBe(false);
    store.set("tekkal:auto-caption-on-upload", "");
    expect(getAutoCaptionOnUpload()).toBe(false);
  });
});
