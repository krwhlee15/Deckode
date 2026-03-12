import type { ShapeElement, ShapeStyle, MarkerType } from "@/types/deck";

export interface ResolvedMarkers {
  startMarker: MarkerType;
  endMarker: MarkerType;
}

/**
 * Resolve effective start/end markers for a line/arrow shape element.
 * - "arrow" shape defaults endMarker to "arrow" (backward compat)
 * - "line" shape defaults both to "none"
 * - Explicit style.markerStart / style.markerEnd always wins
 */
export function resolveMarkers(
  element: ShapeElement,
  style?: ShapeStyle,
): ResolvedMarkers {
  const defaultEnd: MarkerType = element.shape === "arrow" ? "arrow" : "none";
  return {
    startMarker: style?.markerStart ?? "none",
    endMarker: style?.markerEnd ?? defaultEnd,
  };
}
