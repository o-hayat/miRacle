"use client";

import { lazy, Suspense, useState } from "react";
import { Box, ChartScatter, MapPin } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Button } from "./ui/button";
import type { CandidateResult, ReferenceMatch } from "@/lib/analysis/types";

function PlotUnavailable() {
  return (
    <p className="plot-loading" role="status">
      The 3D viewer could not be downloaded. Switch to 2D to continue exploring
      the candidates.
    </p>
  );
}
const FeatureSpace3D = lazy(() =>
  import("./feature-space-3d").catch(() => ({ default: PlotUnavailable })),
);
export const PLOT_BLUE = "#2c67c5";
export const PLOT_TEAL = "#187e79";
export const PLOT_AMBER = "#ae641b";
export function energyDomain(candidates: CandidateResult[]): [number, number] {
  const minimum =
    Math.floor(Math.min(...candidates.map((c) => c.features.mfe_per_nt)) * 10) /
    10;
  const maximum =
    Math.ceil(Math.max(...candidates.map((c) => c.features.mfe_per_nt)) * 10) /
    10;
  return [minimum, Math.max(minimum + 0.1, maximum)];
}

export function CandidateMap({
  candidates,
  length,
  selected,
  onSelect,
}: {
  candidates: CandidateResult[];
  length: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <figure className="research-figure locus-figure">
      <div className="figure-heading">
        <div>
          <p className="figure-number">SEQUENCE MAP</p>
          <h3>Where the candidates sit</h3>
        </div>
        <MapPin aria-hidden="true" />
      </div>
      <div className="locus-axis">
        <span>Input coordinates · 1-based</span>
        <span>{length.toLocaleString()} nt</span>
      </div>
      <div className="locus-rows">
        {candidates.map((c) => (
          <div className="locus-row" key={c.id}>
            <span className="locus-rank">
              {String(c.rank).padStart(2, "0")}
            </span>
            <div className="locus-track">
              <button
                onClick={() => onSelect(c.id)}
                aria-label={`Inspect candidate ${c.rank} on position map`}
                aria-pressed={selected === c.id}
                title={`Candidate ${c.rank} · ${c.start}–${c.end} · ${c.strand} strand`}
                style={{
                  left: `${(100 * (c.start - 1)) / length}%`,
                  width: `${(100 * (c.end - c.start + 1)) / length}%`,
                  background: c.strand === "+" ? PLOT_BLUE : PLOT_TEAL,
                }}
              />
            </div>
            <span className="locus-strand">{c.strand}</span>
          </div>
        ))}
      </div>
      <div className="locus-ticks">
        <span>1</span>
        <span>{Math.round(length / 2).toLocaleString()}</span>
        <span>{length.toLocaleString()}</span>
      </div>
      <figcaption>
        <span className="figure-legend">
          <i style={{ background: PLOT_BLUE }} />
          Forward strand
          <i style={{ background: PLOT_TEAL }} />
          Reverse strand
        </span>
        <span>
          Each row is one candidate. Select an interval to inspect it.
        </span>
      </figcaption>
    </figure>
  );
}

export function CandidateLandscape({
  candidates,
  selected,
  onSelect,
}: {
  candidates: CandidateResult[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [view, setView] = useState("2d");
  const candidate = candidates.find((c) => c.id === selected) ?? candidates[0];
  const [lo, hi] = energyDomain(candidates);
  const x = (energy: number) => 58 + ((energy - lo) / (hi - lo)) * 540;
  const y = (score: number) => 284 - score * 244;
  return (
    <figure className="research-figure feature-figure">
      <div className="figure-heading">
        <div>
          <p className="figure-number">CANDIDATE FEATURES</p>
          <h3>Structure and score, together</h3>
        </div>
        <ToggleGroup
          size="sm"
          aria-label="Candidate plot view"
          value={[view]}
          onValueChange={(values) => {
            if (values[0]) setView(values[0]);
          }}
        >
          <ToggleGroupItem value="2d">
            <ChartScatter aria-hidden="true" />
            2D
          </ToggleGroupItem>
          <ToggleGroupItem value="3d">
            <Box aria-hidden="true" />
            3D
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "3d" ? (
        <Suspense
          fallback={
            <p className="plot-loading" role="status">
              Loading the 3D feature plot…
            </p>
          }
        >
          <FeatureSpace3D
            candidates={candidates}
            selected={selected}
            onSelect={onSelect}
            domain={[lo, hi]}
          />
        </Suspense>
      ) : (
        <svg
          className="feature-plot"
          viewBox="0 0 650 348"
          role="group"
          aria-label="Candidate folding energy per nucleotide versus ranking score"
        >
          <text x="58" y="18" className="chart-label">
            Ranking score / 100
          </text>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1="58"
                x2="598"
                y1={y(t)}
                y2={y(t)}
                className="chart-grid"
              />
              <text x="43" y={y(t) + 4} textAnchor="end" className="chart-tick">
                {t * 100}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <text
                x={58 + t * 540}
                y="307"
                textAnchor="middle"
                className="chart-tick"
              >
                {(lo + t * (hi - lo)).toFixed(2)}
              </text>
            </g>
          ))}
          <text x="328" y="337" textAnchor="middle" className="chart-label">
            Folding energy / nucleotide (kcal/mol/nt)
          </text>
          {candidates.map((c) => (
            <g
              key={c.id}
              role="button"
              tabIndex={0}
              aria-label={`Select candidate ${c.rank} in feature plot`}
              aria-pressed={selected === c.id}
              onClick={() => onSelect(c.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(c.id);
                }
              }}
              className="plot-point"
            >
              <title>{`#${c.rank} · ${c.features.mfe_per_nt.toFixed(3)} kcal/mol/nt · ${(c.model_score * 100).toFixed(1)}/100 · ${(c.features.paired_fraction * 100).toFixed(1)}% paired`}</title>
              <circle
                cx={x(c.features.mfe_per_nt)}
                cy={y(c.model_score)}
                r="14"
                fill="transparent"
              />
              <circle
                cx={x(c.features.mfe_per_nt)}
                cy={y(c.model_score)}
                r={selected === c.id ? 8 : 6}
                fill={c.strand === "+" ? PLOT_BLUE : PLOT_TEAL}
                stroke={selected === c.id ? "#111" : "white"}
                strokeWidth={selected === c.id ? 2 : 1.5}
              />
              {selected === c.id && (
                <text
                  x={x(c.features.mfe_per_nt)}
                  y={y(c.model_score) + (c.model_score > 0.85 ? 30 : -20)}
                  textAnchor="middle"
                  className="chart-point-label"
                >
                  #{c.rank}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      <div className="plot-selection" aria-label="Choose a plotted candidate">
        {candidates.map((c) => (
          <Button
            key={c.id}
            size="xs"
            variant={selected === c.id ? "secondary" : "ghost"}
            aria-label={`Select plotted candidate ${c.rank}`}
            aria-pressed={selected === c.id}
            onClick={() => onSelect(c.id)}
          >
            #{c.rank}
          </Button>
        ))}
      </div>
      <div className="feature-readout" aria-live="polite">
        <strong>Candidate {candidate.rank}</strong>
        <span>{candidate.features.mfe_per_nt.toFixed(3)} kcal/mol/nt</span>
        <span>{(candidate.model_score * 100).toFixed(1)}/100 score</span>
        <span>
          {(candidate.features.paired_fraction * 100).toFixed(1)}% paired
        </span>
      </div>
      <figcaption>
        Measured features for the displayed shortlist. The 3D view adds paired
        fraction as its third axis; these are feature coordinates, not a
        molecular model.
      </figcaption>
    </figure>
  );
}

export function ReferenceSimilarity({
  matches,
}: {
  matches: ReferenceMatch[];
}) {
  return (
    <figure className="research-figure similarity-figure">
      <div className="figure-heading">
        <div>
          <p className="figure-number">COMPARATIVE REFERENCES</p>
          <h3>A view across species</h3>
        </div>
        <span className="figure-legend">
          <i style={{ background: PLOT_BLUE }} />
          Identity
          <i style={{ background: PLOT_TEAL }} />
          Coverage
        </span>
      </div>
      <div className="similarity-rows">
        {matches.map((m, index) => (
          <div className="similarity-row" key={`${m.species}-${index}`}>
            <div>
              <strong>{m.species}</strong>
              <span className="block truncate" title={m.name}>
                {m.name}
              </span>
            </div>
            <div className="similarity-tracks">
              {[
                ["Identity", m.identity, PLOT_BLUE],
                ["Coverage", m.coverage, PLOT_TEAL],
              ].map(([label, value, color]) => (
                <div key={String(label)}>
                  <div
                    className="comparison-bar"
                    role="meter"
                    aria-label={`${m.species} ${label}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Number(value) * 100}
                  >
                    <i
                      style={{
                        width: `${Number(value) * 100}%`,
                        background: String(color),
                      }}
                    />
                  </div>
                  <span>{(Number(value) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        Each bar runs from 0 to 100%. Sequence similarity supports reference
        comparison; it does not establish locus-level conservation.
      </figcaption>
    </figure>
  );
}
