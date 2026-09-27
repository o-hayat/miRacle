"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { pairTable } from "@/lib/analysis/features";
import { download } from "@/lib/analysis/exports";
import { BASE_COLORS, plotPoints, structureSvg } from "@/lib/structure-svg";
import type { CandidateResult, Coordinates } from "@/lib/analysis/types";

export function StructureFigure({
  candidate,
  coordinates,
  signature = false,
  compact = false,
}: {
  candidate: CandidateResult;
  coordinates: Coordinates;
  signature?: boolean;
  compact?: boolean;
}) {
  const [view, setView] = useState<"vienna" | "arc">("vienna"),
    [active, setActive] = useState<number | null>(null);
  const table = pairTable(candidate.dot_bracket),
    width = 940,
    height = signature ? 340 : 400;
  const rawPoints =
    view === "arc"
      ? Array.from(
          { length: table.length },
          (_, i) =>
            [34 + (i * 872) / (table.length - 1), height - 62] as [
              number,
              number,
            ],
        )
      : plotPoints(coordinates, width, height, true);
  // SVG display precision prevents server/browser trig rounding differences
  // from producing hydration warnings; native analysis coordinates stay intact.
  const points = rawPoints.map(
    ([x, y]) =>
      [Number(x.toFixed(3)), Number(y.toFixed(3))] as [number, number],
  );
  const partner = active === null ? -1 : table[active];
  // Annotate the innermost closing pair from the actual dot-bracket structure.
  const closingPair = table.reduce<[number, number]>(
    (pair, j, i) => (j > i && j - i < pair[1] - pair[0] ? [i, j] : pair),
    [0, table.length - 1],
  );
  const armColor = (index: number) =>
    index <= closingPair[0]
      ? "var(--figure-blue)"
      : index < closingPair[1]
        ? "var(--figure-orange)"
        : "var(--figure-teal)";
  const stemIndex = table.findIndex(
    (j, i) => i >= Math.floor(closingPair[0] / 2) && j > i,
  );
  const stem =
    stemIndex < 0
      ? points[0]
      : [
          (points[stemIndex][0] + points[table[stemIndex]][0]) / 2,
          (points[stemIndex][1] + points[table[stemIndex]][1]) / 2,
        ];
  const loop = points[Math.floor((closingPair[0] + closingPair[1]) / 2)];
  return (
    <figure className={signature ? "signature-figure" : "structure-figure"}>
      {signature && (
        <div className="signature-header">
          <strong>Human MIR21 · Predicted hairpin</strong>
          <span>
            {candidate.sequence_rna.length} nt · MFE{" "}
            {candidate.mfe_kcal_mol.toFixed(1)} kcal mol⁻¹
          </span>
        </div>
      )}
      {!signature && !compact && (
        <div className="figure-toolbar">
          <ToggleGroup
            size="sm"
            aria-label="Structure view"
            value={[view]}
            onValueChange={(values) => {
              if (values[0]) setView(values[0] as "vienna" | "arc");
            }}
          >
            <ToggleGroupItem value="vienna">ViennaRNA 2D</ToggleGroupItem>
            <ToggleGroupItem value="arc">Base-pair arcs</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              download(
                structureSvg(
                  candidate.sequence_rna,
                  candidate.dot_bracket,
                  coordinates,
                  view,
                ),
                `${candidate.id}_structure.svg`,
                "image/svg+xml",
              )
            }
          >
            <Download data-icon="inline-start" />
            Download structure SVG
          </Button>
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        tabIndex={0}
        aria-label={`${signature ? "MIR21" : "Candidate"} secondary structure. Use left and right arrows to inspect nucleotides.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            setActive(
              ((active ?? 0) +
                (event.key === "ArrowRight" ? 1 : -1) +
                table.length) %
                table.length,
            );
          }
        }}
      >
        <title>{`${signature ? "MIR21 precursor" : "Predicted secondary structure"} · ${candidate.sequence_rna.length} nucleotides · ViennaRNA 2.7.2`}</title>
        <desc>
          {candidate.dot_bracket}. Grey lines indicate predicted base pairs.
          {signature
            ? "Blue traces the 5′ arm, teal the 3′ arm, and orange the terminal loop. These are native ViennaRNA two-dimensional layout coordinates."
            : "Nucleotides are colored by base."}
        </desc>
        {signature ? (
          points
            .slice(1)
            .map((point, i) => (
              <line
                key={`backbone-${i}`}
                x1={points[i][0]}
                y1={points[i][1]}
                x2={point[0]}
                y2={point[1]}
                stroke={armColor(i + 1)}
                strokeWidth="3"
                strokeLinecap="round"
              />
            ))
        ) : (
          <polyline
            points={points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="#d8ddd9"
            strokeWidth="1.5"
          />
        )}
        {table.map((j, i) => {
          if (j <= i) return null;
          const a = points[i],
            b = points[j];
          return (
            <path
              key={i}
              d={
                view === "arc"
                  ? `M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${height - 62 - (280 * (j - i)) / table.length} ${b[0]} ${b[1]}`
                  : `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`
              }
              fill="none"
              stroke={active === i || active === j ? "#166b53" : "#c3cbc7"}
              strokeWidth={active === i || active === j ? 3 : 1.5}
            />
          );
        })}
        {points.map(([x, y], i) => (
          <g
            key={i}
            onMouseEnter={() => setActive(i)}
            onClick={() => setActive(i)}
          >
            <title>{`${candidate.sequence_rna[i]} · position ${i + 1}${table[i] >= 0 ? ` · paired with ${table[i] + 1}` : " · unpaired"}`}</title>
            <circle
              cx={x}
              cy={y}
              r={active === i || partner === i ? 11 : 8}
              fill={
                active === i || partner === i
                  ? "#e0ece5"
                  : signature
                    ? "var(--figure)"
                    : "white"
              }
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fill={
                signature ? armColor(i) : BASE_COLORS[candidate.sequence_rna[i]]
              }
              fontFamily="var(--font-mono)"
              fontSize="12"
            >
              {candidate.sequence_rna[i]}
            </text>
          </g>
        ))}
        <text x={points[0][0] - 14} y={points[0][1] - 17} className="svg-label">
          5′
        </text>
        <text
          x={points.at(-1)![0] - 14}
          y={points.at(-1)![1] + 24}
          className="svg-label"
        >
          3′
        </text>
        {signature && (
          <g className="signature-annotation">
            <path
              d={`M${stem[0]} ${stem[1] + 18} V${height - 48}`}
              className="signature-leader"
            />
            <text
              x={stem[0]}
              y={height - 28}
              textAnchor="middle"
              className="svg-label"
            >
              Paired stem
            </text>
            <path
              d={`M${loop[0]} ${loop[1] - 18} V40`}
              className="signature-leader"
            />
            <text x={loop[0]} y="26" textAnchor="middle" className="svg-label">
              Terminal loop
            </text>
          </g>
        )}
      </svg>
      {signature && (
        <div
          className="signature-key"
          role="group"
          aria-label="Structure color key"
        >
          <span className="arm-five">
            <i aria-hidden="true" />
            5′ arm
          </span>
          <span className="terminal-loop">
            <i aria-hidden="true" />
            Terminal loop
          </span>
          <span className="arm-three">
            <i aria-hidden="true" />
            3′ arm
          </span>
        </div>
      )}
      <figcaption>
        {signature ? (
          <>
            <span aria-live="polite">
              {active === null
                ? "Figure 1. A known precursor, made inspectable."
                : `Position ${active + 1}: ${candidate.sequence_rna[active]} · ${partner < 0 ? "unpaired" : `paired with ${partner + 1}`}`}
            </span>
            <span>Native ViennaRNA fold · MIR21 positive control</span>
          </>
        ) : (
          <>
            <span className="base-legend">
              {Object.entries(BASE_COLORS).map(([base, color]) => (
                <span key={base} style={{ color }}>
                  {base}
                </span>
              ))}
            </span>
            <span aria-live="polite">
              {active === null
                ? `${view === "vienna" ? "ViennaRNA NAVIEW" : "Base-pair connectivity"} · ${table.length} nt`
                : `Position ${active + 1}: ${candidate.sequence_rna[active]} · ${partner < 0 ? "unpaired" : `paired with ${partner + 1}`}`}
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
