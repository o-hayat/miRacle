"use client";
import { Download, ArrowUpRight } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { StructureFigure } from "./structure-figure";
import {
  CandidateMap,
  CandidateLandscape,
  ReferenceSimilarity,
} from "./research-figures";
import { candidateEvidence } from "@/lib/analysis/evidence";
import {
  candidatesCsv,
  candidatesFasta,
  download,
} from "@/lib/analysis/exports";
import type {
  BrowserAnalysis,
  CandidateResult,
  EvidenceAsset,
} from "@/lib/analysis/types";

export const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export function Note({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <Alert variant={error ? "destructive" : "default"}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function DataTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Sensitivity({ candidate }: { candidate: CandidateResult }) {
  return (
    <div className="sensitivity">
      <h4>Local feature sensitivity</h4>
      {candidate.influences.map((item, i) => (
        <div className="influence" key={i}>
          <span>{item.feature}</span>
          <span
            className={item.direction === "supports" ? "supports" : "cautions"}
          >
            {item.delta_score >= 0 ? "+" : ""}
            {(item.delta_score * 100).toFixed(2)}
          </span>
          <div className="influence-track">
            <i
              className={item.direction}
              style={{
                width: `${Math.min(100, Math.abs(item.delta_score) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
      <p className="caption">
        Score-point changes after replacing one feature with its training
        median. Local sensitivity, not causal effects or additive SHAP values.
      </p>
    </div>
  );
}
export function CandidateDetail({
  candidate,
  analysis,
}: {
  candidate: CandidateResult;
  analysis: BrowserAnalysis;
}) {
  const f = candidate.features;
  return (
    <section
      className="candidate-detail"
      aria-label={`Candidate ${candidate.rank} details`}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            CANDIDATE {String(candidate.rank).padStart(2, "0")}
          </p>
          <h3>A closer look at the hairpin</h3>
        </div>
        <span className="mono muted">
          {candidate.start.toLocaleString()}–{candidate.end.toLocaleString()} (
          {candidate.strand})
        </span>
      </div>
      <div className="stat-grid">
        <Stat
          label="Precursor-likeness"
          value={`${(candidate.model_score * 100).toFixed(1)}/100`}
          note="Ranking score, not a biological probability"
        />
        <Stat
          label="Folding energy"
          value={`${candidate.mfe_kcal_mol.toFixed(1)}`}
          note={`${f.mfe_per_nt.toFixed(3)} kcal/mol/nt`}
        />
        <Stat
          label="Hairpin pairing"
          value={percent(f.paired_fraction)}
          note={`${f.pair_count} pairs · stem ${f.longest_stem}`}
        />
        <Stat
          label="Nearest reference"
          value={candidate.nearest_reference.name}
          note={`${percent(candidate.nearest_reference.identity)} identity · ${percent(candidate.nearest_reference.coverage)} coverage`}
        />
      </div>
      <div className="detail-grid">
        <div>
          <h4>Predicted secondary structure</h4>
          <StructureFigure
            key={candidate.id}
            candidate={candidate}
            coordinates={analysis.layouts[candidate.id]}
          />
          <details>
            <summary>Sequence and dot-bracket notation</summary>
            <pre className="sequence-code">
              {candidate.sequence_rna}
              {"\n"}
              {candidate.dot_bracket}
            </pre>
          </details>
        </div>
        <div>
          <h4>Why it ranked here</h4>
          <ul className="summary-list">
            {candidate.summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <Sensitivity candidate={candidate} />
        </div>
      </div>
      <details className="limitations" open>
        <summary>Evidence this analysis does not provide</summary>
        <ul>
          {candidate.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function Results({
  analysis,
  selected,
  onSelect,
}: {
  analysis: BrowserAnalysis;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const result = analysis.result,
    candidate =
      result.candidates.find((c) => c.id === selected) ?? result.candidates[0];
  return (
    <section className="results" aria-label="Analysis results">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ANALYSIS RESULTS</p>
          <h2>Your candidate shortlist</h2>
        </div>
        <Badge variant="secondary">
          {analysis.provenance.source === "saved"
            ? "Saved example result"
            : "Computed on this device"}
        </Badge>
      </div>
      <div className="stat-grid">
        <Stat
          label="Input length"
          value={`${result.input_length.toLocaleString()} nt`}
        />
        <Stat
          label="Candidates shown"
          value={`${result.candidates.length} / ${result.export_candidates.length}`}
          note="Top 10 shown · up to 25 exported"
        />
        <Stat
          label={
            analysis.provenance.source === "saved"
              ? "Reference runtime"
              : "Runtime"
          }
          value={`${(result.runtime_ms / 1000).toFixed(2)} s`}
        />
        <Stat label="Model" value={result.model_name} />
      </div>
      <p className="caption">
        {result.input_id} · {result.scanner}
      </p>
      {result.genomic_interval && (
        <p className="caption">
          {result.genomic_interval} · {result.masked_exonic_nt.toLocaleString()}{" "}
          annotated nt excluded ({result.exon_mask_mode})
          {result.overlapping_coding_genes.length
            ? ` · ${result.overlapping_coding_genes.join(", ")}`
            : ""}
        </p>
      )}
      {result.warnings.map((w) => (
        <Note key={w}>{w}</Note>
      ))}
      {candidate && (
        <>
          <div className="candidate-figures">
            <CandidateMap
              candidates={result.candidates}
              length={result.input_length}
              selected={selected}
              onSelect={onSelect}
            />
            <CandidateLandscape
              candidates={result.candidates}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Rank",
                  "Coordinates",
                  "Strand",
                  "Length",
                  "Score / 100",
                  "MFE",
                  "Paired",
                  "Nearest curated reference",
                ].map((x) => (
                  <TableHead key={x}>{x}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.candidates.map((c) => (
                <TableRow
                  key={c.id}
                  data-state={selected === c.id ? "selected" : undefined}
                >
                  <TableCell>
                    <Button
                      className="rank-button"
                      size="sm"
                      variant={selected === c.id ? "default" : "ghost"}
                      onClick={() => onSelect(c.id)}
                      aria-label={`Inspect candidate ${c.rank}`}
                      aria-pressed={selected === c.id}
                    >
                      #{c.rank}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {c.start}–{c.end}
                  </TableCell>
                  <TableCell>{c.strand}</TableCell>
                  <TableCell>{c.sequence_rna.length}</TableCell>
                  <TableCell>{(c.model_score * 100).toFixed(1)}</TableCell>
                  <TableCell>{c.mfe_kcal_mol.toFixed(2)}</TableCell>
                  <TableCell>{percent(c.features.paired_fraction)}</TableCell>
                  <TableCell>{c.nearest_reference.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="actions">
            <Button
              variant="outline"
              onClick={() =>
                download(
                  candidatesCsv(result),
                  "mirna_candidates.csv",
                  "text/csv",
                )
              }
            >
              <Download data-icon="inline-start" />
              Download CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(
                  candidatesFasta(result),
                  "mirna_candidates.fa",
                  "text/plain",
                )
              }
            >
              <Download data-icon="inline-start" />
              Download FASTA
            </Button>
            <span className="caption">
              All {result.export_candidates.length} ranked candidates
            </span>
          </div>
          <CandidateDetail candidate={candidate} analysis={analysis} />
        </>
      )}
    </section>
  );
}

export function EvidencePanel({
  candidate,
  data,
}: {
  candidate?: CandidateResult;
  data: EvidenceAsset | null;
}) {
  if (!candidate)
    return (
      <Note>
        Run an analysis and select a candidate to inspect its evidence chain.
      </Note>
    );
  if (!data) return <Note>Loading curated evidence…</Note>;
  const e = candidateEvidence(candidate, data),
    m = candidate.nearest_reference,
    d = candidate.nearest_non_mirna;
  return (
    <div className="panel-stack">
      <div>
        <p className="eyebrow">
          CANDIDATE {candidate.rank} · {candidate.start}–{candidate.end} (
          {candidate.strand})
        </p>
        <h2>Evidence ladder and protein context</h2>
        <p className="lede">
          Computed resemblance, curated identity, processing machinery, and
          validated downstream targets are different evidence types.
        </p>
      </div>
      <Note>
        <strong>{e.level[0]}.</strong> {e.level[1]}
      </Note>
      <DataTable
        head={["Layer", "Status", "What it supports", "What it does not prove"]}
        rows={[
          [
            "Predicted secondary structure",
            "Available",
            "A local hairpin under the folding model",
            "Expression or biological processing",
          ],
          [
            "Supervised model",
            `${(candidate.model_score * 100).toFixed(1)}/100`,
            "Learned precursor resemblance",
            "A calibrated probability or causal mechanism",
          ],
          [
            "Curated precursor match",
            `${percent(m.identity)} identity / ${percent(m.coverage)} coverage`,
            "Known-like sequence when both values are high",
            "Activity in the submitted sample",
          ],
          [
            "Rfam non-miRNA conflict",
            `${percent(d.identity)} identity / ${percent(d.coverage)} coverage`,
            d.name,
            "Exclusion of every alternative RNA class",
          ],
          [
            "Mature sequence annotation",
            e.arms.length ? `${e.arms.length} curated arm(s)` : "Not inferred",
            "Curated annotation for a strong match",
            "Precise processing in this sample",
          ],
          [
            "Protein machinery",
            e.machinery.length
              ? "Candidate-specific primary study"
              : "Canonical context only",
            "Only the experiments listed below",
            "Untested protein interactions",
          ],
        ]}
      />
      <ReferenceSimilarity matches={candidate.comparative_matches} />
      <section>
        <h3>Cross-species precursor similarity</h3>
        <p className="caption">
          Independent panels; these matches do not alter the score or establish
          locus-level evolutionary conservation.
        </p>
        <DataTable
          head={[
            "Species",
            "Nearest precursor",
            "Match strength",
            "Identity",
            "Reference coverage",
            "Source",
          ]}
          rows={candidate.comparative_matches.map((x) => [
            x.species,
            x.name,
            x.identity >= 0.9 && x.coverage >= 0.85
              ? "Strong"
              : x.identity >= 0.75 && x.coverage >= 0.7
                ? "Moderate"
                : "Weak",
            percent(x.identity),
            percent(x.coverage),
            x.source,
          ])}
        />
      </section>
      <section className="article-section">
        <h3>Curated literature context</h3>
        {e.literature ? (
          <>
            <p>
              <strong>{e.literature.display_name}.</strong>{" "}
              {e.literature.summary}
            </p>
            <p className="caption">
              Evidence used in the cited study: {e.literature.evidence}
            </p>
            <Note>{e.literature.caveat}</Note>
            <a
              href={e.literature.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              {e.literature.source_label}
              <ArrowUpRight size={16} />
            </a>
          </>
        ) : (
          <Note>
            {m.identity >= 0.9 && m.coverage >= 0.85
              ? "This strong reference match has no bundled manually curated literature card. No summary is generated automatically."
              : "Literature context is shown only for a strong human curated-reference match."}
          </Note>
        )}
      </section>
      <section>
        <h3>Mature sequence evidence</h3>
        {e.arms.length ? (
          <DataTable
            head={["Curated arm", "Sequence"]}
            rows={e.arms.map(([name, seq]) => [
              name,
              <code key={name}>{seq}</code>,
            ])}
          />
        ) : (
          <Note>
            Mature arms are not inferred without a near-exact curated precursor
            match or exact external-control segment.
          </Note>
        )}
      </section>
      <section>
        <h3>miRNA-associated protein machinery</h3>
        <p className="caption">
          {e.machinery.length
            ? "Candidate-specific experiments from primary studies are listed below."
            : "No candidate-specific machinery experiment is bundled for this sequence. Canonical roles are biological context, not inferred interactions."}
        </p>
        <DataTable
          head={[
            "Protein",
            "Stage & canonical role",
            "Candidate-specific result",
            "Experiment and context",
            "Primary source",
          ]}
          rows={data.proteins.map((p) => {
            const matching = e.machinery.filter((x) => x.protein === p.symbol);
            return [
              p.symbol,
              <span key={p.symbol}>
                {p.stage}
                <br />
                {p.relationship}
              </span>,
              matching.length
                ? matching.map((x) => x.result).join(" / ")
                : "Not tested in bundled evidence",
              matching
                .map(
                  (x) =>
                    `${x.evidence_type}: ${x.experiment} (${x.biological_context})`,
                )
                .join(" / ") || "—",
              matching.length ? (
                <a
                  key="source"
                  href={matching[0].source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {matching[0].reference} ↗
                </a>
              ) : (
                "—"
              ),
            ];
          })}
        />
        <p className="caption">
          Supported interaction requires candidate-specific RIP or biochemical
          binding/processing evidence. “Not tested” means unknown here. “Not
          required” describes pathway dependency, not proof that physical
          contact never occurs.
        </p>
      </section>
      <section>
        <h3>Curated target examples</h3>
        {e.targets.length ? (
          <DataTable
            head={[
              "Mature miRNA",
              "Target gene",
              "Experiments",
              "Support",
              "Reference",
            ]}
            rows={e.targets.map((t) => [
              t.mature_mirna,
              t.target_gene,
              t.experiments,
              t.support_type,
              t.source_url ? (
                <a
                  key={t.reference}
                  href={t.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Primary study ↗
                </a>
              ) : (
                t.reference
              ),
            ])}
          />
        ) : (
          <Note>
            No validated target record is bundled for this candidate. Targets
            are never inferred from a hairpin score.
          </Note>
        )}
      </section>
    </div>
  );
}

type Scores = {
  precision: number;
  recall: number;
  f1: number;
  pr_auc: number;
  roc_auc: number;
  false_positives_per_100_negatives: number;
  confusion_matrix: { tn: number; fp: number; fn: number; tp: number };
};
export interface Metrics {
  dataset: Record<string, unknown>;
  selection: { selected_model: string; threshold: number };
  test: Record<string, Scores>;
  stratified_test: Record<string, Scores>;
  limitations: string[];
}
export function EvaluationPanel({ metrics }: { metrics: Metrics }) {
  const selected = metrics.test[metrics.selection.selected_model],
    matrix = selected.confusion_matrix;
  return (
    <div className="panel-stack">
      <div className="article-section">
        <p className="eyebrow">HELD-OUT EVALUATION</p>
        <h2>A benchmark beyond the example</h2>
        <p className="lede">
          Positive families, genomic regions, and Rfam ncRNA families are
          separated across splits. Similarity matching is excluded from the
          classifier.
        </p>
      </div>
      <div className="stat-grid">
        <Stat label="Precision" value={selected.precision.toFixed(3)} />
        <Stat label="Recall" value={selected.recall.toFixed(3)} />
        <Stat label="PR-AUC" value={selected.pr_auc.toFixed(3)} />
        <Stat
          label="Decision threshold"
          value={`${(metrics.selection.threshold * 100).toFixed(1)}/100`}
        />
      </div>
      <p>
        Logistic regression was selected by validation PR-AUC. The held-out test
        set did not determine model selection.
      </p>
      <div className="evaluation-figures">
        <figure className="research-figure benchmark-figure">
          <div className="figure-heading">
            <div>
              <p className="figure-number">HELD-OUT PERFORMANCE</p>
              <h3>Model comparison</h3>
            </div>
          </div>
          <div className="benchmark-axis">
            <span>0</span>
            <span>0.25</span>
            <span>0.50</span>
            <span>0.75</span>
            <span>1.00</span>
          </div>
          <div className="benchmark-rows">
            {Object.entries(metrics.test).map(([name, scores]) => (
              <div key={name} className="benchmark-row">
                <div className="benchmark-label">
                  <span>{name}</span>
                  {name === metrics.selection.selected_model && (
                    <Badge variant="secondary">Selected</Badge>
                  )}
                </div>
                <div className="benchmark-value">
                  <div
                    className="comparison-bar"
                    role="meter"
                    aria-label={`${name} PR-AUC`}
                    aria-valuemin={0}
                    aria-valuemax={1}
                    aria-valuenow={scores.pr_auc}
                  >
                    <i
                      style={{
                        width: `${scores.pr_auc * 100}%`,
                        background:
                          name === metrics.selection.selected_model
                            ? "var(--chart-blue)"
                            : name.includes("baseline")
                              ? "var(--chart-amber)"
                              : "var(--chart-blue-light)",
                      }}
                    />
                  </div>
                  <strong>{scores.pr_auc.toFixed(3)}</strong>
                </div>
              </div>
            ))}
          </div>
          <figcaption>
            Precision–recall area under the curve, on a shared 0–1 scale. Higher
            is better. Model selection used the validation split.
          </figcaption>
        </figure>
        <figure className="research-figure matrix-figure">
          <div className="figure-heading">
            <div>
              <p className="figure-number">CLASSIFICATION OUTCOMES</p>
              <h3>Confusion matrix — {metrics.selection.selected_model}</h3>
            </div>
          </div>
          <table
            className="confusion-matrix"
            aria-label={`Confusion matrix for ${metrics.selection.selected_model}`}
          >
            <thead>
              <tr>
                <td />
                <th scope="col">
                  Predicted
                  <br />
                  negative
                </th>
                <th scope="col">
                  Predicted
                  <br />
                  positive
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: "Actual negative",
                  counts: [matrix.tn, matrix.fp],
                  names: ["True negative", "False positive"],
                  total: matrix.tn + matrix.fp,
                  correct: 0,
                },
                {
                  label: "Actual positive",
                  counts: [matrix.fn, matrix.tp],
                  names: ["False negative", "True positive"],
                  total: matrix.fn + matrix.tp,
                  correct: 1,
                },
              ].map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {row.counts.map((count, index) => {
                    const fraction = row.total ? count / row.total : 0;
                    return (
                      <td
                        key={row.names[index]}
                        className={
                          index === row.correct
                            ? "matrix-correct"
                            : "matrix-error"
                        }
                        style={{
                          backgroundColor: `rgba(${index === row.correct ? "44, 103, 197" : "192, 123, 47"}, ${0.07 + fraction * 0.28})`,
                        }}
                      >
                        <span>{row.names[index]}</span>
                        <strong>{count}</strong>
                        <small>{percent(fraction)} of row</small>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <figcaption>
            <span className="figure-legend">
              <i className="legend-correct" />
              Correct
              <i className="legend-error" />
              Error
            </span>
            <span>
              Color intensity shows the proportion of each actual class.
              Threshold {metrics.selection.threshold.toFixed(4)}.
            </span>
          </figcaption>
        </figure>
      </div>
      <section>
        <h3>All benchmark measurements</h3>{" "}
        <DataTable
          head={[
            "Held-out method",
            "Precision",
            "Recall",
            "F1",
            "PR-AUC",
            "ROC-AUC",
            "FP / 100 negatives",
          ]}
          rows={Object.entries(metrics.test).map(([name, s]) => [
            name,
            ...[
              s.precision,
              s.recall,
              s.f1,
              s.pr_auc,
              s.roc_auc,
              s.false_positives_per_100_negatives,
            ].map((n) => n.toFixed(3)),
          ])}
        />
      </section>
      <section>
        <h3>Negative-set stress tests</h3>
        <DataTable
          head={[
            "Negative subset",
            "Precision",
            "Recall on shared positives",
            "PR-AUC",
            "FP / 100 negatives",
          ]}
          rows={Object.entries(metrics.stratified_test).map(([name, s]) => [
            name.replaceAll("_", " "),
            s.precision.toFixed(3),
            s.recall.toFixed(3),
            s.pr_auc.toFixed(3),
            s.false_positives_per_100_negatives.toFixed(3),
          ])}
        />
      </section>
      <details>
        <summary>Dataset composition and limitations</summary>
        <pre>{JSON.stringify(metrics.dataset, null, 2)}</pre>
      </details>
      {metrics.limitations.map((l) => (
        <Note key={l}>{l}</Note>
      ))}
    </div>
  );
}
