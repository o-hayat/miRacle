"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Upload,
  X,
  Info,
  BookOpen,
  SlidersHorizontal,
  ChevronDown,
  ScanLine,
  ChartNoAxesCombined,
  Fingerprint,
} from "lucide-react";
import { Button, buttonVariants } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { Progress } from "./ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Separator } from "./ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { StructureFigure } from "./structure-figure";
import { GitHubMark } from "./github-mark";
import {
  DataTable,
  EvaluationPanel,
  EvidencePanel,
  Note,
  Results,
  Sensitivity,
  Stat,
  percent,
  type Metrics,
} from "./research-panels";
import { useAnalysis } from "@/hooks/use-analysis";
import { loadAsset, requestKey } from "@/lib/analysis/assets";
import { inferInputType } from "@/lib/analysis/sequence";
import { CHROMOSOMES, fetchRegion } from "@/lib/analysis/genome";
import { evidenceLevel } from "@/lib/analysis/evidence";
import science from "@/lib/science.json";
import { cn } from "@/lib/utils";
import type {
  AnalysisOptions,
  BrowserAnalysis,
  CandidateResult,
  Coordinates,
  EvidenceAsset,
  Example,
  Manifest,
  MaskMode,
} from "@/lib/analysis/types";

const TABS = [
  "Discover",
  "Compare controls",
  "Evidence",
  "Evaluation",
  "Science & limitations",
];
const MASKS = [
  { value: "cds", label: "Mask protein-coding CDS (recommended)" },
  { value: "all_exons", label: "Mask all exons of protein-coding genes" },
  { value: "none", label: "Do not mask protein regions" },
];
const POSITIVES = [
  { value: "mir21_region.fa", label: "MIR21 known-locus control" },
  {
    value: "external_ncbi_mirnas_flanked/nr_030359_mir630_plusminus500.fa",
    label: "External MIR630 genomic control",
  },
];
const NEGATIVES = [
  { value: "negative_control.fa", label: "Unannotated genomic control" },
  { value: "rfam_trna_control.fa", label: "Rfam tRNA control" },
  { value: "rfam_rrna_control.fa", label: "Rfam rRNA control" },
  { value: "rfam_snorna_control.fa", label: "Rfam snoRNA control" },
  { value: "rfam_ribozyme_control.fa", label: "Rfam ribozyme control" },
];

function Choice({
  id,
  label,
  value,
  items,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        items={items}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
function Running({
  runner,
  onCancel,
}: {
  runner: ReturnType<typeof useAnalysis>;
  onCancel: () => void;
}) {
  return (
    <div className="running" role="status" aria-live="polite">
      <div>
        <span>{runner.progress.stage}</span>
        <Button variant="ghost" onClick={onCancel}>
          <X data-icon="inline-start" />
          Cancel analysis
        </Button>
      </div>
      <Progress
        aria-label="Analysis progress"
        value={
          runner.progress.total
            ? (100 * runner.progress.completed) / runner.progress.total
            : null
        }
      />
      <p className="caption">
        {runner.progress.total
          ? `${runner.progress.completed.toLocaleString()} / ${runner.progress.total.toLocaleString()}`
          : "The first analysis downloads the scientific reference assets."}{" "}
        · You can keep exploring while this runs.
      </p>
    </div>
  );
}

export function Workspace({
  manifest,
  examples,
  metrics,
  signature,
}: {
  manifest: Manifest;
  examples: Example[];
  metrics: Metrics;
  signature: { candidate: CandidateResult; coordinates: Coordinates };
}) {
  const [tab, setTab] = useState("Discover"),
    [text, setText] = useState(examples[0].text),
    [inputMethod, setInputMethod] = useState("sequence"),
    [example, setExample] = useState(examples[0].name),
    [mask, setMask] = useState<MaskMode>("cds");
  const [chrom, setChrom] = useState("chr17"),
    [start, setStart] = useState("59840773"),
    [end, setEnd] = useState("59841772");
  const [analysis, setAnalysis] = useState<BrowserAnalysis | null>(null),
    [selected, setSelected] = useState("candidate-1"),
    [snapshot, setSnapshot] = useState({ text: "", mask: "" });
  const [message, setMessage] = useState(""),
    [inputError, setInputError] = useState(""),
    [regionBusy, setRegionBusy] = useState(false),
    [savedBusy, setSavedBusy] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceAsset | null>(null),
    [evidenceError, setEvidenceError] = useState("");
  const [positive, setPositive] = useState(POSITIVES[0].value),
    [negative, setNegative] = useState(NEGATIVES[0].value);
  const [comparison, setComparison] = useState<{
      positive: BrowserAnalysis;
      negative: BrowserAnalysis;
      positiveName: string;
      negativeName: string;
    } | null>(null),
    [comparisonBusy, setComparisonBusy] = useState(false);
  const scan = useAnalysis(),
    compare = useAnalysis();
  const generation = useRef(0),
    comparisonGeneration = useRef(0),
    region = useRef<AbortController | null>(null),
    upload = useRef<HTMLInputElement | null>(null);
  const candidate =
    analysis?.result.candidates.find((c) => c.id === selected) ??
    analysis?.result.candidates[0];
  const stale = analysis && (snapshot.text !== text || snapshot.mask !== mask);
  const loadEvidence = useCallback(
    () =>
      loadAsset<EvidenceAsset>(manifest, manifest.evidence)
        .then((data) => {
          setEvidence(data);
          setEvidenceError("");
        })
        .catch((e) => setEvidenceError(e.message)),
    [manifest],
  );
  useEffect(() => {
    if ((analysis || comparison) && !evidence && !evidenceError)
      void loadEvidence();
  }, [analysis, comparison, evidence, evidenceError, loadEvidence]);
  useEffect(() => () => region.current?.abort(), []);
  function invalidate() {
    generation.current++;
    scan.cancel();
    region.current?.abort();
    setRegionBusy(false);
    setSavedBusy(false);
    setInputError("");
    scan.setError("");
    setMessage("");
  }
  function changeText(value: string) {
    invalidate();
    setText(value);
  }
  function options(sequence: string, mode: MaskMode): AnalysisOptions {
    return {
      input_type: inferInputType(sequence),
      input_id: "input_sequence",
      mask_mode: mode,
    };
  }
  async function run() {
    invalidate();
    const current = generation.current;
    try {
      const result = await scan.run(text, options(text, mask));
      if (current !== generation.current) return;
      setAnalysis(result);
      setSelected("candidate-1");
      setSnapshot({ text, mask });
      setMessage("Analysis complete.");
    } catch {
      /* The worker exposes actionable errors. */
    }
  }
  async function saved() {
    invalidate();
    const current = generation.current;
    setSavedBusy(true);
    try {
      const exampleData = examples.find((e) => e.name === example)!;
      const result = await loadAsset<BrowserAnalysis>(
        manifest,
        exampleData.saved,
      );
      const key = await requestKey(text, options(text, mask), manifest);
      if (current !== generation.current) return;
      if (
        result.provenance.key !== key ||
        result.provenance.data !== manifest.version ||
        result.provenance.engine !== manifest.engine
      )
        throw new Error(
          "This saved result does not match the current sequence, genomic context, or preprocessing. Run a new candidate scan.",
        );
      setAnalysis(result);
      setSelected("candidate-1");
      setSnapshot({ text, mask });
      setMessage(
        "Saved example loaded. Runtime reflects the Python reference run.",
      );
    } catch (e) {
      if (current === generation.current)
        setInputError(
          e instanceof Error ? e.message : "Could not load the saved example.",
        );
    } finally {
      if (current === generation.current) setSavedBusy(false);
    }
  }
  async function loadRegion() {
    invalidate();
    const current = generation.current;
    const controller = new AbortController();
    region.current = controller;
    setRegionBusy(true);
    try {
      const value = await fetchRegion(
        chrom,
        Number(start),
        Number(end),
        examples,
        controller.signal,
      );
      if (current !== generation.current) return;
      setText(value);
      setMessage(
        `Loaded ${chrom}:${Number(start).toLocaleString()}–${Number(end).toLocaleString()} from GRCh38.`,
      );
    } catch (e) {
      if (!controller.signal.aborted && current === generation.current)
        setInputError(
          e instanceof Error ? e.message : "Unable to load region.",
        );
    } finally {
      if (current === generation.current) setRegionBusy(false);
    }
  }
  function cancelComparison() {
    comparisonGeneration.current++;
    compare.cancel();
    setComparisonBusy(false);
  }
  async function runComparison() {
    cancelComparison();
    const current = comparisonGeneration.current;
    setComparisonBusy(true);
    const pos = examples.find((e) => e.name === positive)!,
      neg = examples.find((e) => e.name === negative)!;
    try {
      const p = await compare.run(pos.text, options(pos.text, "cds"));
      if (current !== comparisonGeneration.current) return;
      const n = await compare.run(neg.text, options(neg.text, "cds"));
      if (current !== comparisonGeneration.current) return;
      setComparison({
        positive: p,
        negative: n,
        positiveName: POSITIVES.find((p) => p.value === positive)!.label,
        negativeName: NEGATIVES.find((n) => n.value === negative)!.label,
      });
    } catch {
      /* Error rendered below. */
    } finally {
      if (current === comparisonGeneration.current) setComparisonBusy(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="miRacle home">
          miRacle
          <span className="wordmark-dot" />
        </a>
        <nav aria-label="Main navigation">
          <a className="nav-link" href="#workspace">
            Research tool
          </a>
          <button
            className="nav-link about-link"
            onClick={() => {
              setTab("Science & limitations");
              document.getElementById("workspace")?.scrollIntoView();
            }}
          >
            About the science
          </button>
          <a
            href="https://github.com/o-hayat/miRacle"
            className={cn(buttonVariants(), "source-link")}
            data-slot="button"
          >
            <GitHubMark data-icon="inline-start" />
            GitHub
          </a>
        </nav>
      </header>
      <main id="top">
        <section className="intro article-section">
          <p className="eyebrow">COMPUTATIONAL BIOLOGY · HUMAN miRNA</p>
          <h1>
            A clearer view of
            <br />
            microRNA candidates.
          </h1>
          <p className="intro-copy">
            From a short human sequence to an explainable shortlist of
            precursor-like hairpins. Fold, rank, and inspect the evidence for
            your next experiment.
          </p>
          <a
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "intro-link",
            )}
            data-slot="button"
            href="#workspace"
          >
            Explore a sequence <ArrowRight data-icon="inline-end" />
          </a>
        </section>
        <div className="signature-wrap">
          <StructureFigure
            candidate={signature.candidate}
            coordinates={signature.coordinates}
            signature
          />
        </div>
        <section id="workspace" className="workspace">
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <div className="tabs-scroll">
              <TabsList aria-label="Research workflows">
                {TABS.map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="Discover" keepMounted>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SEQUENCE ANALYSIS</p>
                  <h2>Start with a sequence.</h2>
                  <p className="discover-intro">
                    Paste your sequence, upload a FASTA file, or explore the
                    MIR21 example below.
                  </p>
                </div>
                <span className="privacy-note">
                  Your sequence stays on this device.
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          aria-label="About sequence privacy"
                          className="info-button"
                        />
                      }
                    >
                      <Info size={16} />
                    </TooltipTrigger>
                    <TooltipContent>
                      Uploaded and pasted sequences are analyzed locally. Only
                      requests for unbundled genomic coordinates go to UCSC.
                    </TooltipContent>
                  </Tooltip>
                </span>
              </div>
              <div className="sequence-workbench">
                <div className="sequence-editor">
                  <FieldGroup>
                    <div className="entry-method">
                      {" "}
                      <Choice
                        id="input-method"
                        label="Input method"
                        value={inputMethod}
                        items={[
                          { value: "sequence", label: "Sequence / FASTA" },
                          {
                            value: "coordinates",
                            label: "hg38 genomic coordinates",
                          },
                        ]}
                        onChange={(value) => {
                          invalidate();
                          setInputMethod(value);
                        }}
                      />
                    </div>
                    {inputMethod === "coordinates" && (
                      <>
                        <div className="coordinate-fields">
                          <Choice
                            id="chromosome"
                            label="Chromosome"
                            value={chrom}
                            items={Object.keys(CHROMOSOMES).map((c) => ({
                              value: c,
                              label: c,
                            }))}
                            onChange={(v) => {
                              invalidate();
                              setChrom(v);
                            }}
                          />
                          <Field>
                            <FieldLabel htmlFor="start-index">
                              Start index
                            </FieldLabel>
                            <Input
                              id="start-index"
                              type="number"
                              min={1}
                              value={start}
                              onChange={(e) => {
                                invalidate();
                                setStart(e.target.value);
                              }}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="end-index">
                              End index
                            </FieldLabel>
                            <Input
                              id="end-index"
                              type="number"
                              min={1}
                              value={end}
                              onChange={(e) => {
                                invalidate();
                                setEnd(e.target.value);
                              }}
                            />
                          </Field>
                        </div>
                        <div className="actions">
                          <Button
                            variant="outline"
                            onClick={loadRegion}
                            disabled={regionBusy}
                          >
                            {regionBusy ? "Loading region…" : "Load region"}
                          </Button>
                          <span className="caption">
                            One-based, inclusive GRCh38 coordinates.
                          </span>
                        </div>
                        <FieldDescription>
                          Bundled intervals work offline. Other intervals are
                          requested directly from UCSC, then analyzed locally.
                        </FieldDescription>
                      </>
                    )}
                    <Field data-invalid={Boolean(inputError || scan.error)}>
                      <div className="field-label-row">
                        <FieldLabel htmlFor="sequence">
                          Sequence or FASTA
                        </FieldLabel>
                        <span className="caption">55–20,000 nt</span>
                      </div>
                      <Textarea
                        id="sequence"
                        value={text}
                        onChange={(e) => changeText(e.target.value)}
                        spellCheck={false}
                        aria-invalid={Boolean(inputError || scan.error)}
                        aria-describedby="sequence-hint"
                      />
                      <FieldDescription id="sequence-hint">
                        One record. A, C, G, T, U, and N accepted. Result
                        coordinates are relative to this input.
                      </FieldDescription>
                    </Field>
                    <div className="actions spread">
                      <div className="actions">
                        <Button
                          size="lg"
                          onClick={run}
                          disabled={scan.busy || regionBusy || savedBusy}
                        >
                          Run candidate scan
                          <ArrowRight data-icon="inline-end" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => upload.current?.click()}
                        >
                          <Upload data-icon="inline-start" />
                          Upload FASTA
                        </Button>
                        <input
                          ref={upload}
                          aria-label="Upload one FASTA or text record"
                          type="file"
                          accept=".fa,.fasta,.txt"
                          className="sr-only"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            invalidate();
                            const current = generation.current;
                            try {
                              if (file.size > 1_000_000)
                                throw new Error(
                                  "File is too large. Upload one FASTA record with at most 20,000 nt.",
                                );
                              const value = await file.text();
                              if (current === generation.current)
                                setText(value);
                            } catch (error) {
                              setInputError(
                                error instanceof Error
                                  ? error.message
                                  : "Could not read file.",
                              );
                            }
                            e.target.value = "";
                          }}
                        />
                      </div>
                      <Button
                        variant="link"
                        disabled={scan.busy || savedBusy || regionBusy}
                        onClick={saved}
                      >
                        {savedBusy ? "Loading…" : "View saved example"}
                      </Button>
                    </div>
                  </FieldGroup>
                  <div className="input-options">
                    <Collapsible className="input-option">
                      <CollapsibleTrigger
                        className="option-trigger"
                        aria-label="Reference controls"
                      >
                        <BookOpen aria-hidden="true" />
                        <span>Reference controls</span>
                        <span className="option-summary">Bundled examples</span>
                        <ChevronDown aria-hidden="true" />
                      </CollapsibleTrigger>
                      <CollapsibleContent
                        className="option-content"
                        keepMounted
                      >
                        <FieldGroup>
                          {" "}
                          {inputMethod === "sequence" && (
                            <div className="example-field">
                              <Choice
                                id="example"
                                label="Example"
                                value={example}
                                items={examples.map((e) => ({
                                  value: e.name,
                                  label: e.label,
                                }))}
                                onChange={setExample}
                              />
                              <Button
                                variant="outline"
                                onClick={() =>
                                  changeText(
                                    examples.find((e) => e.name === example)!
                                      .text,
                                  )
                                }
                              >
                                Load selected control
                              </Button>
                            </div>
                          )}
                          {inputMethod === "coordinates" && (
                            <p className="caption">
                              Switch the input method to Sequence / FASTA to
                              load a bundled reference control.
                            </p>
                          )}
                        </FieldGroup>
                      </CollapsibleContent>
                    </Collapsible>
                    <Collapsible className="input-option">
                      <CollapsibleTrigger
                        className="option-trigger"
                        aria-label="Analysis settings"
                      >
                        <SlidersHorizontal aria-hidden="true" />
                        <span>Analysis settings</span>
                        <span className="option-summary">
                          {mask === "cds"
                            ? "CDS masking"
                            : mask === "all_exons"
                              ? "All-exon masking"
                              : "No masking"}
                        </span>
                        <ChevronDown aria-hidden="true" />
                      </CollapsibleTrigger>
                      <CollapsibleContent
                        className="option-content"
                        keepMounted
                      >
                        <FieldGroup>
                          {" "}
                          <Choice
                            id="mask"
                            label="Protein-region preprocessing"
                            value={mask}
                            items={MASKS}
                            onChange={(v) => {
                              invalidate();
                              setMask(v as MaskMode);
                            }}
                          />
                          <FieldDescription>
                            Masking needs a length-matched hg38 or GRCh38
                            interval in the FASTA header. CDS masking preserves
                            untranslated exonic regions.
                          </FieldDescription>
                        </FieldGroup>{" "}
                        <p className="caption input-note">
                          U-only RNA is scanned as supplied. DNA and ambiguous
                          input are scanned on both strands.
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
                <aside
                  className="sequence-guide"
                  aria-label="How the analysis works"
                >
                  <p className="eyebrow">FROM SEQUENCE TO EVIDENCE</p>
                  <ol>
                    <li>
                      <ScanLine aria-hidden="true" />
                      <div>
                        <h3>Find local folds</h3>
                        <p>Scan short windows for precursor-like hairpins.</p>
                      </div>
                    </li>
                    <li>
                      <ChartNoAxesCombined aria-hidden="true" />
                      <div>
                        <h3>Compare candidates</h3>
                        <p>
                          Inspect structure, score, and curated-reference
                          similarity.
                        </p>
                      </div>
                    </li>
                    <li>
                      <Fingerprint aria-hidden="true" />
                      <div>
                        <h3>Follow the evidence</h3>
                        <p>
                          Keep computational resemblance separate from
                          experimental support.
                        </p>
                      </div>
                    </li>
                  </ol>
                </aside>
              </div>
              {(inputError || scan.error) && (
                <Note error>{inputError || scan.error}</Note>
              )}
              {scan.busy && (
                <Running
                  runner={scan}
                  onCancel={() => {
                    invalidate();
                    setMessage(
                      "Analysis cancelled. You can edit the input and run again.",
                    );
                  }}
                />
              )}
              {message && (
                <p className="status-text" role="status">
                  {message}
                </p>
              )}
              {stale && (
                <Note>
                  The input or preprocessing has changed. The results below
                  belong to the previous scan. Run a new candidate scan to
                  update them.
                </Note>
              )}
              {analysis && (
                <Results
                  analysis={analysis}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
              {!analysis && (
                <p className="initial-caveat">
                  A hairpin is a starting point. A score does not establish
                  expression, precise processing, targets, function, or disease
                  relevance.
                </p>
              )}
            </TabsContent>
            <TabsContent value="Compare controls" keepMounted>
              <div className="panel-stack">
                <div className="article-section">
                  <p className="eyebrow">CONTROL COMPARISON</p>
                  <h2>Put a candidate in context.</h2>
                  <p className="lede">
                    Run the identical folding, feature, and model pipeline on a
                    known miRNA region and a negative control. A demonstration
                    contrast, separate from the held-out benchmark.
                  </p>
                </div>
                <FieldGroup className="comparison-fields">
                  <Choice
                    id="positive"
                    label="Positive control"
                    value={positive}
                    items={POSITIVES}
                    onChange={(v) => {
                      cancelComparison();
                      setPositive(v);
                    }}
                  />
                  <Choice
                    id="negative"
                    label="Negative control"
                    value={negative}
                    items={NEGATIVES}
                    onChange={(v) => {
                      cancelComparison();
                      setNegative(v);
                    }}
                  />
                  <Button
                    size="lg"
                    disabled={comparisonBusy}
                    onClick={runComparison}
                  >
                    Run comparison
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </FieldGroup>
                {compare.error && <Note error>{compare.error}</Note>}
                {comparisonBusy && (
                  <Running runner={compare} onCancel={cancelComparison} />
                )}
                {comparison && (
                  <Comparison data={comparison} evidence={evidence} />
                )}
              </div>
            </TabsContent>
            <TabsContent value="Evidence" keepMounted>
              {evidenceError ? (
                <Note error>
                  {evidenceError}
                  <Button variant="outline" onClick={loadEvidence}>
                    Retry evidence download
                  </Button>
                </Note>
              ) : (
                <EvidencePanel candidate={candidate} data={evidence} />
              )}
            </TabsContent>
            <TabsContent value="Evaluation" keepMounted>
              <EvaluationPanel metrics={metrics} />
            </TabsContent>
            <TabsContent value="Science & limitations" keepMounted>
              <article className="science article-section">
                <p className="eyebrow">METHOD & INTERPRETATION</p>
                <h2>What the evidence means</h2>
                {science.map((paragraph, i) => (
                  <p key={i}>
                    {paragraph
                      .split(/(\*\*.*?\*\*)/)
                      .map((chunk, j) =>
                        chunk.startsWith("**") ? (
                          <strong key={j}>{chunk.slice(2, -2)}</strong>
                        ) : (
                          chunk
                        ),
                      )}
                  </p>
                ))}
                <Separator />
                <h3>A reproducible local analysis</h3>
                <p>
                  The browser uses ViennaRNA 2.7.2, scanning 60, 70, 90, and 110
                  nt windows. The native Python application remains the
                  scientific reference and also supports RNALfold. The exported
                  classifier preserves the trained scaling parameters,
                  coefficients, and validation threshold.
                </p>
                <p className="caption">
                  Engine: {manifest.engine}
                  <br />
                  Data release: {manifest.version}
                </p>
              </article>
            </TabsContent>
          </Tabs>
        </section>
      </main>
      <footer className="site-footer">
        <a className="wordmark" href="#top">
          miRacle
        </a>
        <p>Sequence-first research. Evidence-led decisions.</p>
        <span>Research prototype · Human pre-miRNA triage</span>
      </footer>
    </>
  );
}

function Comparison({
  data,
  evidence,
}: {
  data: {
    positive: BrowserAnalysis;
    negative: BrowserAnalysis;
    positiveName: string;
    negativeName: string;
  };
  evidence: EvidenceAsset | null;
}) {
  const p = data.positive.result.candidates[0],
    n = data.negative.result.candidates[0];
  if (!p || !n)
    return (
      <Note>
        {!p ? data.positiveName : data.negativeName} produced no candidate
        passing the loose filters. This is a valid negative result; there is no
        top candidate to compare.
      </Note>
    );
  const threshold = data.positive.result.score_threshold ?? 0;
  return (
    <>
      <div className="stat-grid">
        <Stat
          label="Positive top score"
          value={`${(p.model_score * 100).toFixed(1)}/100`}
        />
        <Stat
          label="Negative top score"
          value={`${(n.model_score * 100).toFixed(1)}/100`}
        />
        <Stat
          label="Score separation"
          value={`${p.model_score >= n.model_score ? "+" : ""}${((p.model_score - n.model_score) * 100).toFixed(1)} points`}
        />
        <Stat
          label="Decision threshold"
          value={`${(threshold * 100).toFixed(1)}/100`}
        />
      </div>
      <Note>
        {p.model_score >= threshold && n.model_score < threshold
          ? "Expected contrast: the positive control exceeds the threshold while the negative control stays below it."
          : "This contrast does not cleanly separate at the threshold. Review each evidence layer; control labels do not override computed scores."}
      </Note>
      <DataTable
        head={["Measure", data.positiveName, data.negativeName]}
        rows={[
          [
            "Precursor-likeness",
            `${(p.model_score * 100).toFixed(1)}/100`,
            `${(n.model_score * 100).toFixed(1)}/100`,
          ],
          [
            "Coordinates",
            `${p.start}–${p.end} (${p.strand})`,
            `${n.start}–${n.end} (${n.strand})`,
          ],
          [
            "Folding energy (kcal/mol)",
            p.mfe_kcal_mol.toFixed(2),
            n.mfe_kcal_mol.toFixed(2),
          ],
          [
            "MFE / nt",
            p.features.mfe_per_nt.toFixed(3),
            n.features.mfe_per_nt.toFixed(3),
          ],
          [
            "Paired nucleotides",
            percent(p.features.paired_fraction),
            percent(n.features.paired_fraction),
          ],
          [
            "Nearest reference",
            p.nearest_reference.name,
            n.nearest_reference.name,
          ],
          [
            "Reference identity / coverage",
            `${percent(p.nearest_reference.identity)} / ${percent(p.nearest_reference.coverage)}`,
            `${percent(n.nearest_reference.identity)} / ${percent(n.nearest_reference.coverage)}`,
          ],
          [
            "Non-miRNA decoy",
            p.nearest_non_mirna.name,
            n.nearest_non_mirna.name,
          ],
          [
            "Decoy identity / coverage",
            `${percent(p.nearest_non_mirna.identity)} / ${percent(p.nearest_non_mirna.coverage)}`,
            `${percent(n.nearest_non_mirna.identity)} / ${percent(n.nearest_non_mirna.coverage)}`,
          ],
        ]}
      />
      <div className="comparison-grid">
        {[
          [data.positive, data.positiveName],
          [data.negative, data.negativeName],
        ].map(([value, label]) => {
          const analysis = value as BrowserAnalysis,
            c = analysis.result.candidates[0];
          return (
            <section key={String(label)}>
              <h3>{String(label)}</h3>
              <p>
                {evidence
                  ? evidenceLevel(c, evidence)[0]
                  : "Computed candidate"}{" "}
                · {c.start}–{c.end} ({c.strand})
              </p>
              <StructureFigure
                candidate={c}
                coordinates={analysis.layouts[c.id]}
                compact
              />
              <Sensitivity candidate={c} />
            </section>
          );
        })}
      </div>
      <Note>
        Hairpin geometry also occurs in non-miRNA RNA. The learned score,
        curated-reference match, and Rfam conflict provide different evidence
        layers.
      </Note>
    </>
  );
}
