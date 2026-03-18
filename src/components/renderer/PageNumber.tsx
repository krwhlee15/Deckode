import { memo } from "react";
import type { PageNumberConfig } from "@/types/deck";

interface Props {
  pageNumber: number;
  totalPages: number;
  config: PageNumberConfig;
}

export const PageNumber = memo(function PageNumber({ pageNumber, totalPages, config }: Props) {
  const {
    position = "bottom-right",
    fontSize = 14,
    color = "#94a3b8",
    fontFamily,
    format = "number",
    margin = 20,
    opacity = 1,
  } = config;

  const text = format === "number-total"
    ? `${pageNumber} / ${totalPages}`
    : `${pageNumber}`;

  const posStyle: React.CSSProperties = {
    position: "absolute",
    fontSize,
    color,
    fontFamily: fontFamily || "sans-serif",
    opacity,
    lineHeight: 1,
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  if (position.startsWith("bottom")) posStyle.bottom = margin;
  else posStyle.top = margin;

  if (position.endsWith("right")) posStyle.right = margin;
  else if (position.endsWith("left")) posStyle.left = margin;
  else {
    posStyle.left = "50%";
    posStyle.transform = "translateX(-50%)";
  }

  return <div style={posStyle}>{text}</div>;
});
