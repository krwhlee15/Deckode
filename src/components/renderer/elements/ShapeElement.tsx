import type { ShapeElement as ShapeElementType, ShapeStyle } from "@/types/deck";
import { useElementStyle } from "@/contexts/ThemeContext";
import { resolveMarkers } from "@/utils/lineMarkers";

interface Props {
  element: ShapeElementType;
}

/** Apply alpha to a CSS color string. Handles hex (#rgb, #rrggbb), "transparent", and pass-through. */
function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  if (color === "transparent") return color;
  const hex = color.replace("#", "");
  if (hex.length === 3) {
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

export function ShapeElementRenderer({ element }: Props) {
  const style = useElementStyle<ShapeStyle>("shape", element.style);
  const { w, h } = element.size;
  const fOp = style.fillOpacity ?? 1;
  const sOp = style.strokeOpacity ?? 1;

  if (element.shape === "ellipse") {
    // Inset radii by half the stroke width so the stroke doesn't get clipped at the edges
    const sw = style.strokeWidth ?? 1;
    const rx = Math.max(0, w / 2 - sw / 2);
    const ry = Math.max(0, h / 2 - sw / 2);
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: style.opacity ?? 1 }}>
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={rx}
          ry={ry}
          fill={style.fill ?? "transparent"}
          fillOpacity={fOp}
          stroke={style.stroke ?? "#ffffff"}
          strokeOpacity={sOp}
          strokeWidth={sw}
        />
      </svg>
    );
  }

  if (element.shape === "line" || element.shape === "arrow") {
    const { startMarker, endMarker } = resolveMarkers(element, style);
    const strokeColor = style.stroke ?? "#ffffff";
    const sw = style.strokeWidth ?? 2;
    const pathD = style.path;
    const waypoints = style.waypoints;
    const hasWaypoints = waypoints && waypoints.length >= 2;

    const markerDefs: React.ReactNode[] = [];

    const addArrowMarker = (id: string, position: "start" | "end") => {
      markerDefs.push(
        <marker
          key={id}
          id={id}
          markerWidth="10"
          markerHeight="7"
          refX={position === "start" ? 1 : 9}
          refY="3.5"
          orient={position === "start" ? "auto-start-reverse" : "auto"}
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill={strokeColor}
            fillOpacity={sOp}
          />
        </marker>,
      );
    };

    const addCircleMarker = (id: string, position: "start" | "end") => {
      markerDefs.push(
        <marker
          key={id}
          id={id}
          markerWidth="8"
          markerHeight="8"
          refX={position === "start" ? 2 : 6}
          refY="4"
          orient="auto"
        >
          <circle
            cx="4"
            cy="4"
            r="3"
            fill={strokeColor}
            fillOpacity={sOp}
          />
        </marker>,
      );
    };

    let markerStartAttr: string | undefined;
    let markerEndAttr: string | undefined;

    if (startMarker !== "none") {
      const id = `marker-start-${element.id}`;
      if (startMarker === "arrow") addArrowMarker(id, "start");
      else addCircleMarker(id, "start");
      markerStartAttr = `url(#${id})`;
    }
    if (endMarker !== "none") {
      const id = `marker-end-${element.id}`;
      if (endMarker === "arrow") addArrowMarker(id, "end");
      else addCircleMarker(id, "end");
      markerEndAttr = `url(#${id})`;
    }

    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ opacity: style.opacity ?? 1, overflow: "visible" }}
      >
        {markerDefs.length > 0 && <defs>{markerDefs}</defs>}
        {hasWaypoints ? (
          <polyline
            points={waypoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={strokeColor}
            strokeOpacity={sOp}
            strokeWidth={sw}
            markerStart={markerStartAttr}
            markerEnd={markerEndAttr}
          />
        ) : pathD ? (
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeOpacity={sOp}
            strokeWidth={sw}
            markerStart={markerStartAttr}
            markerEnd={markerEndAttr}
          />
        ) : (
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            stroke={strokeColor}
            strokeOpacity={sOp}
            strokeWidth={sw}
            markerStart={markerStartAttr}
            markerEnd={markerEndAttr}
          />
        )}
      </svg>
    );
  }

  // Rectangle (default)
  return (
    <div
      style={{
        width: w,
        height: h,
        backgroundColor: withAlpha(style.fill ?? "transparent", fOp),
        border:
          style.stroke || style.strokeWidth
            ? `${style.strokeWidth ?? 1}px solid ${withAlpha(style.stroke ?? "#ffffff", sOp)}`
            : undefined,
        borderRadius: style.borderRadius ?? 0,
        opacity: style.opacity ?? 1,
      }}
    />
  );
}
