import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseSequence,
  inferInputType,
  validSegments,
  reverseComplement,
  reverseCoordinates,
  maskSequence,
  parseInterval,
} from "../src/lib/analysis/sequence";
import {
  localAlignment,
  matchReference,
  numpyArgsort,
} from "../src/lib/analysis/similarity";
import {
  extractFeatures,
  passesGate,
  pairTable,
} from "../src/lib/analysis/features";
import { wrapVienna } from "../src/lib/analysis/wasm";
import { windows, analyze } from "../src/lib/analysis/pipeline";
import { validateRegion, fetchRegion } from "../src/lib/analysis/genome";
import { pythonFixed } from "../src/lib/analysis/exports";
import { requestKey } from "../src/lib/analysis/assets";
import type {
  ReferenceAsset,
  AnalysisOptions,
  Manifest,
} from "../src/lib/analysis/types";
const read = (name: string) => JSON.parse(fs.readFileSync(name, "utf8"));
const edges = read("tests/fixtures/edges.json");
const { default: create } = await import(
  pathToFileURL(path.resolve("public/wasm/vienna-2.7.2.mjs")).href
);
const engine = wrapVienna(await create());

test("Python validation oracle: RNA, DNA, N, FASTA records, invalid characters and length limits", () => {
  for (const row of edges.parsing) {
    if (row.error)
      assert.throws(() => parseSequence(row.text), { message: row.error });
    else {
      assert.deepEqual(parseSequence(row.text), row.expected);
      assert.equal(inferInputType(row.text), row.input_type);
    }
  }
});
test("N segment offsets and reverse strand coordinates match Python", () => {
  for (const row of edges.segments) {
    assert.deepEqual(validSegments(row.sequence), row.expected);
    assert.equal(reverseComplement(row.sequence), row.reverse);
  }
  for (const row of edges.coordinates)
    assert.deepEqual(
      reverseCoordinates(row.start, row.end, row.length),
      row.expected,
    );
});
test("masking is half-open in BED, preserves Ns, and requires matching genomic context", () => {
  const result = maskSequence("ACGUNACGUA", 101, 110, [
    [90, 100, "outside"],
    [100, 102, "left"],
    [102, 105, "middle"],
    [104, 108, "overlap"],
    [110, 120, "right"],
  ]);
  assert.equal(result.sequence, "NNNNNNNNUA");
  assert.equal(result.masked_nt, 7);
  assert.deepEqual(result.genes, ["left", "middle", "overlap"]);
  assert.equal(parseInterval("chr17:101-110 hg38", 9), null);
  assert.equal(parseInterval("chr17:101-110 hg19", 10), null);
  assert.equal(parseInterval("chr17:101-110 GRCh38", 10)?.start, 101);
});
test("WASM folds and all structural features match Python on edge geometries", () => {
  for (const row of edges.folds) {
    const fold = engine.fold(row.sequence);
    assert.equal(fold.structure, row.structure);
    assert.ok(Math.abs(fold.mfe - row.mfe) <= 1e-5);
    const features = extractFeatures({
      start: 1,
      end: row.sequence.length,
      strand: "+",
      sequence: row.sequence,
      ...fold,
    });
    for (const key of Object.keys(features))
      assert.ok(Math.abs(features[key] - row.features[key]) < 1e-7, key);
    assert.equal(passesGate(features), row.passes);
  }
  assert.throws(() => pairTable("(()"));
  assert.throws(() => pairTable("a"));
});
test("NumPy shortlist ties and local alignment traceback are preserved", () => {
  for (const row of edges.sorts)
    assert.deepEqual(numpyArgsort(row.values), row.expected);
  for (const row of edges.matches)
    assert.deepEqual(
      matchReference(row.query, row.asset as ReferenceAsset),
      row.expected,
    );
  for (const row of edges.alignments)
    assert.deepEqual(localAlignment(row.query, row.reference), row.expected);
});
test("window endpoints include exact short precursors and terminal offsets", () => {
  const short = windows("A".repeat(65), "+");
  assert.ok(short.some((w) => w.start === 1 && w.end === 65));
  assert.ok(short.some((w) => w.start === 6 && w.end === 65));
  const longer = windows("A".repeat(121), "-");
  assert.ok(longer.some((w) => w.start === 12 && w.end === 121));
  assert.equal(windows("N".repeat(20000), "+").length, 0);
});
test("20,000 N bases are a valid empty analysis and 20,001 are rejected", () => {
  const manifest: Manifest = read("public/data/manifest.json");
  const model = read(path.join("public", manifest.base, manifest.model));
  const options: AnalysisOptions = {
    input_type: "genomic",
    input_id: "empty",
    mask_mode: "none",
  };
  const result = analyze(
    "N".repeat(20000),
    options,
    { model, references: [] },
    engine,
  );
  assert.equal(result.candidates.length, 0);
  assert.equal(result.input_length, 20000);
  assert.equal(result.scanner, "No foldable N-free segment");
  assert.throws(
    () =>
      analyze("A".repeat(20001), options, { model, references: [] }, engine),
    /maximum is 20,000/,
  );
});
test("CPython formatting preserves exact halfway and inexact decimal rounding", () => {
  assert.equal(pythonFixed(0.5625, 3), "0.562");
  assert.equal(pythonFixed(0.6875, 3), "0.688");
  assert.equal(pythonFixed(2.675, 2), "2.67");
  assert.equal(pythonFixed(-0, 3), "-0.000");
});
test("saved keys bind sequence, genomic context, preprocessing, input ID, and versions", async () => {
  const manifest: Manifest = read("public/data/manifest.json"),
    options: AnalysisOptions = {
      input_type: "genomic",
      input_id: "x",
      mask_mode: "cds",
    };
  const text = ">x chr17:1-60 hg38\n" + "A".repeat(60),
    key = await requestKey(text, options, manifest);
  for (const changed of [
    "A".repeat(60),
    text.replace("chr17", "chr18"),
    text.replace("1-60", "2-61"),
    text + "A",
  ])
    assert.notEqual(await requestKey(changed, options, manifest), key);
  assert.notEqual(
    await requestKey(text, { ...options, mask_mode: "none" }, manifest),
    key,
  );
  assert.notEqual(
    await requestKey(text, options, { ...manifest, version: "different" }),
    key,
  );
  assert.notEqual(
    await requestKey(text, options, { ...manifest, engine: "different" }),
    key,
  );
});
test("hg38 validation uses one-based inclusive bounds and rejects incomplete UCSC responses", async () => {
  assert.deepEqual(validateRegion("17", 1, 60), {
    chrom: "chr17",
    start: 1,
    end: 60,
  });
  for (const args of [
    ["chrM", 1, 60],
    ["chr17", 0, 60],
    ["chr17", 1, 54],
    ["chr17", 1, 20001],
    ["chr17", 1, 90000000],
  ] as const)
    assert.throws(() => validateRegion(args[0], args[1], args[2]));
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ dna: "ACGT" }), { status: 200 });
  try {
    await assert.rejects(
      fetchRegion("chr17", 1, 60, []),
      /incomplete or invalid/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
