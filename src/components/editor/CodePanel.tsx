import { useRef, useCallback, useState, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useDeckStore } from "@/stores/deckStore";
import type { Deck, Slide } from "@/types/deck";

type Tab = "slide" | "deck";

/** Build on-disk representation: $ref slides become { "$ref": "path" }, inline slides strip _ref */
function deckAsOnDisk(deck: Deck): unknown {
  const clone = JSON.parse(JSON.stringify(deck)) as Record<string, unknown>;
  const slides = (clone.slides as Record<string, unknown>[]).map((s) => {
    if (s._ref) {
      return { $ref: s._ref };
    }
    const { _ref: _, ...rest } = s as Record<string, unknown>;
    return rest;
  });
  clone.slides = slides;
  return clone;
}

/** Strip _ref from a slide for editing */
function slideForEdit(slide: Slide): Record<string, unknown> {
  const { _ref: _, ...rest } = slide as unknown as Record<string, unknown>;
  return rest;
}

export function CodePanel() {
  const deck = useDeckStore((s) => s.deck);
  const currentSlideIndex = useDeckStore((s) => s.currentSlideIndex);
  const updateSlide = useDeckStore((s) => s.updateSlide);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const suppressChange = useRef(false);
  const [tab, setTab] = useState<Tab>("slide");

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const slide = deck?.slides[currentSlideIndex];

  // Get JSON content for current tab
  const getContent = useCallback(() => {
    if (!deck) return "";
    if (tab === "deck") {
      return JSON.stringify(deckAsOnDisk(deck), null, 2);
    }
    if (!slide) return "";
    return JSON.stringify(slideForEdit(slide), null, 2);
  }, [deck, slide, tab]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value || suppressChange.current) return;
      if (tab === "deck") return; // deck tab is read-only
      if (!slide) return;
      try {
        const parsed = JSON.parse(value) as Partial<Slide>;
        // Re-inject _ref if the slide had one
        if (slide._ref) {
          (parsed as Record<string, unknown>)._ref = slide._ref;
        }
        suppressChange.current = true;
        updateSlide(slide.id, parsed);
        suppressChange.current = false;
      } catch {
        // Intermediate invalid JSON during typing — ignore
      }
    },
    [tab, slide, updateSlide],
  );

  // Sync store → editor when not focused
  const json = getContent();
  if (editorRef.current) {
    const editor = editorRef.current;
    const model = editor.getModel();
    if (model && !editor.hasTextFocus()) {
      const currentValue = model.getValue();
      if (currentValue !== json) {
        suppressChange.current = true;
        model.setValue(json);
        suppressChange.current = false;
      }
    }
  }

  // Force content update on tab change
  useEffect(() => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    suppressChange.current = true;
    model.setValue(json);
    suppressChange.current = false;
    // Update read-only mode
    editorRef.current.updateOptions({ readOnly: tab === "deck" });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!deck) return null;

  const tabClass = (t: Tab) =>
    `px-3 py-1 text-xs transition-colors ${
      tab === t
        ? "text-white border-b-2 border-blue-500"
        : "text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-zinc-800 shrink-0">
        <button className={tabClass("slide")} onClick={() => setTab("slide")}>
          Slide
        </button>
        <button className={tabClass("deck")} onClick={() => setTab("deck")}>
          Deck
        </button>
        {tab === "deck" && (
          <span className="ml-auto px-2 py-1 text-[10px] text-zinc-500">read-only</span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="json"
          theme="vs-dark"
          defaultValue={json}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            automaticLayout: true,
            readOnly: tab === "deck",
          }}
        />
      </div>
    </div>
  );
}
