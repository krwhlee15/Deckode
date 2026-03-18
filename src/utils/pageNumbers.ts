import type { Deck, PageNumberConfig } from "@/types/deck";

export interface PageNumberInfo {
  pageNumber: number;
  totalPages: number;
  config: PageNumberConfig;
}

/**
 * Compute page number info for a given slide index.
 * Returns undefined if page numbers are disabled or the slide opts out.
 */
export function getPageNumberInfo(
  deck: Deck,
  slideIndex: number,
): PageNumberInfo | undefined {
  const config = deck.pageNumbers;
  if (!config?.enabled) return undefined;

  const slide = deck.slides[slideIndex];
  if (!slide || slide.hidden || slide.hidePageNumber) return undefined;

  // Count visible pages up to (and including) this slide
  let pageNumber = 0;
  let totalPages = 0;
  for (let i = 0; i < deck.slides.length; i++) {
    if (deck.slides[i]!.hidden) continue;
    totalPages++;
    if (i === slideIndex) pageNumber = totalPages;
  }

  if (pageNumber === 0) return undefined;

  return { pageNumber, totalPages, config };
}
