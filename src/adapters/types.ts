import type { Deck } from "@/types/deck";
import type { NewProjectConfig } from "@/utils/projectTemplates";

export interface ProjectInfo {
  name: string;
  title: string;
}

export interface TikzResult {
  ok: boolean;
  svgUrl?: string;
  error?: string;
}

export interface LayoutInfo {
  name: string;
  title: string;
}

export interface RenameProjectOptions {
  /** New folder name. Only honored when canRenameFolder is true. */
  newName?: string;
  /** New display title (deck.meta.title). */
  newTitle?: string;
}

export interface FileSystemAdapter {
  loadDeck(): Promise<Deck>;
  /** Save deck. Returns null on success, or the current disk Deck on conflict. */
  saveDeck(deck: Deck): Promise<Deck | null>;
  listProjects(): Promise<ProjectInfo[]>;
  createProject(name: string, config: NewProjectConfig): Promise<void>;
  deleteProject(name: string): Promise<void>;
  /**
   * Rename the current project. Mutates the adapter's `projectName` to the
   * new value on success. Adapters that cannot rename throw.
   */
  renameProject?(opts: RenameProjectOptions): Promise<{ name: string }>;
  /** Whether this adapter supports renaming the project folder (vs. title only). */
  readonly canRenameFolder: boolean;
  uploadAsset(file: File): Promise<string>;
  resolveAssetUrl(path: string): string | undefined | Promise<string | undefined>;
  renderTikz(
    elementId: string,
    content: string,
    preamble?: string,
  ): Promise<{ ok: true; svgUrl: string } | { ok: false; error: string }>;
  listComponents(): Promise<string[]>;
  listLayouts(): Promise<LayoutInfo[]>;
  loadLayout(layoutName: string): Promise<import("@/types/deck").Slide>;
  readonly mode: "vite" | "fs-access" | "readonly";
  readonly projectName: string;
  readonly lastSaveHash: number | null;
}
