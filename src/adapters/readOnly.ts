import type { Deck } from "@/types/deck";
import type { FileSystemAdapter, LayoutInfo, ProjectInfo } from "./types";
import type { NewProjectConfig } from "@/utils/projectTemplates";
import { assert } from "@/utils/assert";

export class ReadOnlyAdapter implements FileSystemAdapter {
  readonly mode = "readonly" as const;
  readonly lastSaveHash: number | null = null;
  readonly canRenameFolder = false;
  readonly projectName: string;

  private deck: Deck;
  readonly assetBaseUrl: string;
  assetMap?: Record<string, string>;
  /**
   * In-memory cache of TikZ-compiled SVGs. Demos can't persist to disk,
   * so we stash blob URLs here and let resolveAssetUrl read from the
   * map. Survives for the lifetime of the adapter (one tab session).
   */
  private tikzBlobCache = new Map<string, string>();

  constructor(projectName: string, deck: Deck, assetBaseUrl: string) {
    this.projectName = projectName;
    this.deck = deck;
    this.assetBaseUrl = assetBaseUrl;
  }

  async loadDeck(): Promise<Deck> {
    return this.deck;
  }

  async saveDeck(_deck: Deck): Promise<Deck | null> {
    assert(false, "ReadOnlyAdapter: saveDeck is not supported");
  }

  async listProjects(): Promise<ProjectInfo[]> {
    assert(false, "ReadOnlyAdapter: listProjects is not supported");
  }

  async createProject(_name: string, _config: NewProjectConfig): Promise<void> {
    assert(false, "ReadOnlyAdapter: createProject is not supported");
  }

  async deleteProject(_name: string): Promise<void> {
    assert(false, "ReadOnlyAdapter: deleteProject is not supported");
  }

  async uploadAsset(_file: File): Promise<string> {
    assert(false, "ReadOnlyAdapter: uploadAsset is not supported");
  }

  resolveAssetUrl(path: string): string {
    const cachedBlob = this.tikzBlobCache.get(path);
    if (cachedBlob) return cachedBlob;
    if (this.assetMap?.[path]) return this.assetMap[path]!;
    if (path.startsWith("./assets/")) {
      return `${this.assetBaseUrl}/${path.slice(9)}`;
    }
    return path;
  }

  /**
   * Compile TikZ to SVG via the bundled TikZJax WASM engine (same path
   * FsAccessAdapter uses for static prod mode). The output can't be
   * persisted — we're readonly — so we stash the blob URL in an
   * in-memory cache keyed by a synthetic asset path and resolveAssetUrl
   * serves it back. That lets the standard `isSvgFresh(el)` render
   * path fire without the adapter needing write access.
   */
  async renderTikz(
    elementId: string,
    content: string,
    preamble?: string,
  ): Promise<{ ok: true; svgUrl: string } | { ok: false; error: string }> {
    try {
      const { renderTikzToSvg } = await import("@/utils/tikzjax");
      const svgMarkup = await renderTikzToSvg(content, preamble);
      const basePath = `./assets/tikz/${elementId}.svg`;
      const storedPath = `${basePath}?v=${Date.now()}`;
      const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
      const blobUrl = URL.createObjectURL(blob);
      this.tikzBlobCache.set(storedPath, blobUrl);
      return { ok: true, svgUrl: storedPath };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async listComponents(): Promise<string[]> {
    return [];
  }

  async listLayouts(): Promise<LayoutInfo[]> {
    return [];
  }

  async loadLayout(_layoutName: string): Promise<import("@/types/deck").Slide> {
    assert(false, "ReadOnlyAdapter: loadLayout is not supported");
  }

  static fromBundled(deck: Deck, assetBaseUrl: string): ReadOnlyAdapter {
    return new ReadOnlyAdapter("demo", deck, assetBaseUrl);
  }

  static fromRemote(name: string, deck: Deck, assetBaseUrl: string): ReadOnlyAdapter {
    return new ReadOnlyAdapter(name, deck, assetBaseUrl);
  }

  /** Create adapter for pop-out windows using pre-resolved asset URLs (e.g. blob URLs). */
  static fromAssetMap(
    projectName: string,
    deck: Deck,
    assetMap: Record<string, string>,
  ): ReadOnlyAdapter {
    const adapter = new ReadOnlyAdapter(projectName, deck, "");
    adapter.assetMap = assetMap;
    return adapter;
  }
}
