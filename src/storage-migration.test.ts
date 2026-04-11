/**
 * Storage migration tests for the remaining tekkal rebrand shims:
 *  - chatStore.loadSessions: per-project chat history in localStorage
 *  - ProjectSettingsDialog.getStoredProjectPath: project → abs path map
 *
 * Both modules transparently migrate from pre-rebrand "deckode-*" /
 * "deckode:*" keys to the new "tekkal-*" / "tekkal:*" keys on first
 * read. Tests stub localStorage to run under node without jsdom.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ── In-memory localStorage stub (installed before dynamic imports) ──

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

// Dynamic imports so the stub is in place before module top-level code runs
const { loadSessions } = await import("./stores/chatStore");
const { getStoredProjectPath } = await import("./components/editor/ProjectSettingsDialog");

beforeEach(() => {
  store.clear();
});

// ─────────────────────────────────────────────────────────────────────
// chatStore.loadSessions
// ─────────────────────────────────────────────────────────────────────

describe("chatStore.loadSessions — storage and migration", () => {
  const project = "my-project";

  it("returns empty array when nothing is stored", () => {
    expect(loadSessions(project)).toEqual([]);
  });

  it("reads from the canonical tekkal key", () => {
    const sessions = [{ id: "s1", name: "Session 1", messages: [], createdAt: 1 }];
    store.set(`tekkal:chat:${project}`, JSON.stringify(sessions));
    const result = loadSessions(project);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("s1");
  });

  it("migrates the legacy deckode key on first read", () => {
    const sessions = [
      { id: "s1", name: "Old Session", messages: [], createdAt: 100 },
      { id: "s2", name: "Another", messages: [], createdAt: 200 },
    ];
    store.set(`deckode:chat:${project}`, JSON.stringify(sessions));

    const result = loadSessions(project);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Old Session");

    // New key now holds the value, legacy key is gone
    expect(store.has(`tekkal:chat:${project}`)).toBe(true);
    expect(store.has(`deckode:chat:${project}`)).toBe(false);
  });

  it("isolates migration per project", () => {
    store.set(
      `deckode:chat:project-a`,
      JSON.stringify([{ id: "a", name: "A", messages: [], createdAt: 1 }]),
    );
    store.set(
      `deckode:chat:project-b`,
      JSON.stringify([{ id: "b", name: "B", messages: [], createdAt: 1 }]),
    );

    loadSessions("project-a");
    // Only project-a was touched
    expect(store.has(`tekkal:chat:project-a`)).toBe(true);
    expect(store.has(`deckode:chat:project-a`)).toBe(false);
    expect(store.has(`tekkal:chat:project-b`)).toBe(false);
    expect(store.has(`deckode:chat:project-b`)).toBe(true);
  });

  it("prefers the canonical key when both exist", () => {
    store.set(
      `tekkal:chat:${project}`,
      JSON.stringify([{ id: "new", name: "New", messages: [], createdAt: 1 }]),
    );
    store.set(
      `deckode:chat:${project}`,
      JSON.stringify([{ id: "old", name: "Old", messages: [], createdAt: 1 }]),
    );
    const result = loadSessions(project);
    expect(result[0]!.id).toBe("new");
    // Legacy untouched
    expect(store.has(`deckode:chat:${project}`)).toBe(true);
  });

  it("returns empty array on corrupt JSON instead of throwing", () => {
    store.set(`tekkal:chat:${project}`, "{{{ not json");
    expect(loadSessions(project)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// ProjectSettingsDialog.getStoredProjectPath
// ─────────────────────────────────────────────────────────────────────

describe("getStoredProjectPath — storage and migration", () => {
  it("returns null when no map is stored", () => {
    expect(getStoredProjectPath("my-project")).toBeNull();
  });

  it("reads a path from the canonical tekkal-project-paths key", () => {
    store.set(
      "tekkal-project-paths",
      JSON.stringify({ "my-project": "/abs/path/to/proj" }),
    );
    expect(getStoredProjectPath("my-project")).toBe("/abs/path/to/proj");
  });

  it("returns null for a project not in the map", () => {
    store.set(
      "tekkal-project-paths",
      JSON.stringify({ other: "/abs/other" }),
    );
    expect(getStoredProjectPath("my-project")).toBeNull();
  });

  it("migrates the legacy deckode-project-paths key on first read", () => {
    store.set(
      "deckode-project-paths",
      JSON.stringify({
        alpha: "/abs/alpha",
        beta: "/abs/beta",
      }),
    );
    expect(getStoredProjectPath("alpha")).toBe("/abs/alpha");
    // After migration, the new key holds both entries and the legacy is gone
    expect(store.has("tekkal-project-paths")).toBe(true);
    expect(store.has("deckode-project-paths")).toBe(false);
    // Second lookup hits the new key
    expect(getStoredProjectPath("beta")).toBe("/abs/beta");
  });

  it("returns null (not throw) on corrupt JSON", () => {
    store.set("tekkal-project-paths", "not json {{{");
    expect(getStoredProjectPath("my-project")).toBeNull();
  });
});
