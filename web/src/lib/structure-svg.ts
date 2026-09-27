import { pairTable } from "./analysis/features";
import type { Coordinates } from "./analysis/types";

export const BASE_COLORS: Record<string, string> = {
  A: "#166b53",
  C: "#315fb3",
  G: "#956408",
  U: "#aa4565",
};
export function plotPoints(
  coordinates: Coordinates,
  width: number,
  height: number,
  horizontal = false,
): Coordinates {
  let points = coordinates;
  if (horizontal && points.length) {
    const a = points[0],
      b = points[points.length - 1],
      loop = points[Math.floor(points.length / 2)],
      origin = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const angle = -Math.atan2(loop[1] - origin[1], loop[0] - origin[0]);
    points = points.map(([x, y]) => [
      x * Math.cos(angle) - y * Math.sin(angle),
      x * Math.sin(angle) + y * Math.cos(angle),
    ]);
  }
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    dx = Math.max(1, Math.max(...xs) - minX),
    dy = Math.max(1, Math.max(...ys) - minY);
  const scale = Math.min((width - 100) / dx, (height - 110) / dy);
  return points.map(([x, y]) => [
    (width - dx * scale) / 2 + (x - minX) * scale,
    (height - dy * scale) / 2 + (y - minY) * scale,
  ]);
}
export function structureSvg(
  sequence: string,
  structure: string,
  coordinates: Coordinates,
  view: "vienna" | "arc" = "vienna",
) {
  const width = 940,
    height = 440,
    table = pairTable(structure),
    points =
      view === "arc"
        ? Array.from(
            { length: sequence.length },
            (_, i) =>
              [34 + (i * 872) / (sequence.length - 1), 350] as [number, number],
          )
        : plotPoints(coordinates, width, height, true);
  const paths = table
    .flatMap((j, i) => {
      if (j <= i) return [];
      const a = points[i],
        b = points[j];
      return view === "arc"
        ? `<path d="M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${350 - (300 * (j - i)) / sequence.length} ${b[0]} ${b[1]}"/>`
        : `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="ViennaRNA secondary structure"><title>ViennaRNA 2.7.2 minimum-free-energy structure</title><desc>${sequence}\n${structure}</desc><rect width="940" height="440" fill="white"/><g fill="none" stroke="#c3cbc7" stroke-width="1.5">${paths}<polyline points="${points.map((p) => p.join(",")).join(" ")}" stroke="#d8ddd9"/></g>${points.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="8" fill="white"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="${BASE_COLORS[sequence[i]]}" font-family="monospace" font-size="12">${sequence[i]}</text>`).join("")}</svg>`;
}
