import { useDeckStore } from "@/stores/deckStore";

interface Props {
  expanded: boolean;
  onToggle: () => void;
}

export function NotesEditor({ expanded, onToggle }: Props) {
  const deck = useDeckStore((s) => s.deck);
  const currentSlideIndex = useDeckStore((s) => s.currentSlideIndex);
  const updateSlide = useDeckStore((s) => s.updateSlide);

  if (!deck) return null;
  const slide = deck.slides[currentSlideIndex];
  if (!slide) return null;

  return (
    <div className="shrink-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <svg
          className={`w-2.5 h-2.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 6 10"
          fill="currentColor"
        >
          <path d="M0 0l6 5-6 5z" />
        </svg>
        Notes
      </button>
      {expanded && (
        <div className="px-3 pb-2 flex-1 flex flex-col min-h-0">
          <textarea
            className="w-full flex-1 bg-zinc-800 text-zinc-200 rounded px-2 py-1.5 text-xs border border-zinc-700 focus:border-blue-500 focus:outline-none resize-none"
            value={slide.notes ?? ""}
            placeholder="Presenter notes..."
            onChange={(e) => updateSlide(slide.id, { notes: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
