import { useCallback, useState, useRef } from "react";
import { useDeckStore, setDeckDragging } from "@/stores/deckStore";
import type { SlideElement, ShapeElement } from "@/types/deck";

interface Props {
  element: ShapeElement;
  slideId: string;
  scale: number;
}

export function WaypointOverlay({ element, slideId, scale }: Props) {
  const updateElement = useDeckStore((s) => s.updateElement);
  const waypoints = element.style?.waypoints;
  if (!waypoints || waypoints.length < 2) return null;

  const ex = element.position.x;
  const ey = element.position.y;

  // Local waypoints during drag for responsive feedback
  const [localWaypoints, setLocalWaypoints] = useState<{ x: number; y: number }[] | null>(null);
  const pts = localWaypoints ?? waypoints;

  const styleRef = useRef(element.style);
  styleRef.current = element.style;

  const commitWaypoints = useCallback(
    (newWaypoints: { x: number; y: number }[]) => {
      updateElement(slideId, element.id, {
        style: { ...styleRef.current, waypoints: newWaypoints },
      } as Partial<SlideElement>);
    },
    [slideId, element.id, updateElement],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      e.preventDefault();
      setDeckDragging(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const origWaypoints = [...waypoints];
      const origPt = { ...origWaypoints[index]! };

      const prevent = (ev: Event) => ev.preventDefault();
      document.addEventListener("selectstart", prevent);

      const handleMouseMove = (me: MouseEvent) => {
        if (me.buttons === 0) { handleMouseUp(); return; }
        const dx = (me.clientX - startX) / scale;
        const dy = (me.clientY - startY) / scale;
        const updated = origWaypoints.map((p, i) =>
          i === index
            ? { x: Math.round(origPt.x + dx), y: Math.round(origPt.y + dy) }
            : { ...p },
        );
        setLocalWaypoints(updated);
      };

      const handleMouseUp = () => {
        setDeckDragging(false);
        document.removeEventListener("selectstart", prevent);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        setLocalWaypoints((prev) => {
          if (prev) commitWaypoints(prev);
          return null;
        });
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [waypoints, scale, commitWaypoints],
  );

  return (
    <>
      {/* Dashed line connecting waypoint handles */}
      <svg
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 43,
        }}
      >
        <polyline
          points={pts.map((p) => `${ex + p.x},${ey + p.y}`).join(" ")}
          fill="none"
          stroke="rgba(16,185,129,0.5)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      </svg>

      {/* Waypoint handles */}
      {pts.map((pt, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: ex + pt.x - 5,
            top: ey + pt.y - 5,
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: "rgb(16,185,129)",
            border: "2px solid white",
            cursor: "move",
            pointerEvents: "auto",
            zIndex: 44,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, i)}
        />
      ))}
    </>
  );
}
