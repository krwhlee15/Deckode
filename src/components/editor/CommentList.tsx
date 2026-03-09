import { useState, useRef, useEffect } from "react";
import { useDeckStore } from "@/stores/deckStore";
import type { Comment } from "@/types/deck";
import { FieldLabel } from "./fields";

interface Props {
  slideId: string;
  elementId?: string;
}

export function CommentList({ slideId, elementId }: Props) {
  const deck = useDeckStore((s) => s.deck);
  const addComment = useDeckStore((s) => s.addComment);
  const updateComment = useDeckStore((s) => s.updateComment);
  const deleteComment = useDeckStore((s) => s.deleteComment);
  const selectElement = useDeckStore((s) => s.selectElement);

  const slide = deck?.slides.find((s) => s.id === slideId);
  const allComments = slide?.comments ?? [];

  // Filter: element view shows only that element's comments; slide view shows all
  const comments = elementId
    ? allComments.filter((c) => c.elementId === elementId)
    : [...allComments].sort((a, b) => a.createdAt - b.createdAt);

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Build element id → type label map for slide-level view
  const elementLabels = new Map<string, string>();
  if (!elementId && slide) {
    for (const el of slide.elements) {
      elementLabels.set(el.id, `${el.type}/${el.id}`);
    }
  }

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    addComment(slideId, {
      id: crypto.randomUUID().slice(0, 8),
      elementId,
      text,
      createdAt: Date.now(),
    });
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditText(comment.text);
  };

  const commitEdit = () => {
    if (editingId && editText.trim()) {
      updateComment(slideId, editingId, editText.trim());
    }
    setEditingId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  // Auto-focus edit textarea
  useEffect(() => {
    if (editingId) {
      const el = document.querySelector<HTMLTextAreaElement>(`[data-comment-edit="${editingId}"]`);
      el?.focus();
      el?.select();
    }
  }, [editingId]);

  return (
    <div>
      <FieldLabel>Comments{comments.length > 0 ? ` (${comments.length})` : ""}</FieldLabel>

      {comments.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="group rounded bg-amber-900/20 border border-amber-700/30 px-2 py-1.5"
            >
              {/* Element label in slide-level view */}
              {!elementId && comment.elementId && (
                <button
                  onClick={() => selectElement(comment.elementId!)}
                  className="text-[10px] text-amber-500/70 font-mono hover:text-amber-400 transition-colors mb-0.5 block"
                >
                  {elementLabels.get(comment.elementId) ?? comment.elementId}
                </button>
              )}
              {!elementId && !comment.elementId && (
                <span className="text-[10px] text-zinc-500 font-mono mb-0.5 block">slide</span>
              )}

              {editingId === comment.id ? (
                <textarea
                  data-comment-edit={comment.id}
                  className="w-full bg-zinc-800 text-amber-200 rounded px-1.5 py-1 text-xs resize-none border border-amber-600 focus:outline-none"
                  value={editText}
                  rows={2}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={commitEdit}
                />
              ) : (
                <div className="flex items-start gap-1">
                  <p className="text-xs text-amber-200/90 whitespace-pre-wrap flex-1 break-words">
                    {comment.text}
                  </p>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => startEdit(comment)}
                      className="text-[10px] text-zinc-500 hover:text-amber-400 px-1"
                      title="Edit"
                    >
                      edit
                    </button>
                    <button
                      onClick={() => deleteComment(slideId, comment.id)}
                      className="text-[10px] text-zinc-500 hover:text-red-400 px-1"
                      title="Delete"
                    >
                      del
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment form */}
      <div className="flex gap-1">
        <textarea
          ref={textareaRef}
          className="flex-1 bg-zinc-800 text-zinc-200 rounded px-2 py-1 text-xs resize-none border border-zinc-700 focus:border-amber-500 focus:outline-none"
          value={draft}
          rows={1}
          placeholder="Add comment..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          +
        </button>
      </div>
    </div>
  );
}
