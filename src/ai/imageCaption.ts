/**
 * Auto-caption hook for image elements.
 *
 * When a user adds an image to the deck, this fires a one-shot Gemini
 * multimodal call to generate a one-sentence description and writes it to
 * the element's aiSummary field. Downstream agents (Planner, Generator)
 * then see meaningful image semantics in the deck summary instead of
 * "image[no alt — UNDESCRIBED]".
 *
 * The call is fire-and-forget — failures (no API key, network issues,
 * unsupported format) are logged and silently dropped. We never block the
 * editor on caption generation.
 */

import { useDeckStore } from "@/stores/deckStore";
import { downscaleImage } from "@/utils/imageDownscale";
import { callGemini, getApiKey, getModelForAgent } from "./geminiClient";
import type { ImageElement } from "@/types/deck";

const captionsInFlight = new Set<string>();
const captionsDone = new Set<string>();

const CAPTION_PROMPT = `Describe this image in one concise sentence (under 25 words) suitable as a slide-context summary for a presentation editor. Focus on what the image depicts, not its style. No leading phrases like "This image shows" — just the description.`;

/**
 * Schedule a caption generation for an image element. Idempotent: same src
 * is only captioned once per page lifetime. Safe to call from any code path
 * that creates an image element.
 */
export function scheduleImageCaption(slideId: string, elementId: string): void {
  // Defer to next tick so the element is definitely in the store
  queueMicrotask(() => runCaption(slideId, elementId));
}

async function runCaption(slideId: string, elementId: string): Promise<void> {
  if (!getApiKey()) return; // No API key configured — silent skip

  const deck = useDeckStore.getState().deck;
  if (!deck) return;
  const slide = deck.slides.find((s) => s.id === slideId);
  const element = slide?.elements.find((e) => e.id === elementId);
  if (!element || element.type !== "image") return;

  const img = element as ImageElement;
  if (!img.src) return;
  if (img.aiSummary) return; // Already captioned
  if (captionsDone.has(img.src)) return;
  if (captionsInFlight.has(img.src)) return;

  captionsInFlight.add(img.src);
  try {
    const downscaled = await downscaleImage(img.src, { maxLongEdge: 768 });
    const response = await callGemini({
      model: getModelForAgent("planner"),
      systemInstruction: "You write concise, factual image descriptions for a slide editor. One sentence only.",
      message: [
        { text: CAPTION_PROMPT },
        {
          inlineData: {
            mimeType: downscaled.mimeType,
            data: downscaled.base64,
          },
        },
      ],
    });
    const summary = response.text.trim().replace(/^["']|["']$/g, "");
    if (!summary) return;

    // Re-check the element still exists; it may have been deleted while we waited
    const currentDeck = useDeckStore.getState().deck;
    const currentSlide = currentDeck?.slides.find((s) => s.id === slideId);
    const currentEl = currentSlide?.elements.find((e) => e.id === elementId);
    if (!currentEl || currentEl.type !== "image") return;

    useDeckStore.getState().updateElement(slideId, elementId, { aiSummary: summary });
    captionsDone.add(img.src);
  } catch (err) {
    console.warn(`[imageCaption] failed for ${elementId}:`, err);
  } finally {
    captionsInFlight.delete(img.src);
  }
}

/** Test/dev helper: clear caption caches. */
export function clearCaptionCache(): void {
  captionsInFlight.clear();
  captionsDone.clear();
}
