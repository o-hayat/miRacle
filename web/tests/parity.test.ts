import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyze } from "../src/lib/analysis/pipeline";
import { wrapVienna } from "../src/lib/analysis/wasm";
import { candidateEvidence } from "../src/lib/analysis/evidence";
import { candidatesCsv, candidatesFasta } from "../src/lib/analysis/exports";
import { parseInterval, parseSequence } from "../src/lib/analysis/sequence";
import { requestKey } from "../src/lib/analysis/assets";
import type {
  AnalysisOptions,
  BrowserAnalysis,
  EvidenceAsset,
  Manifest,
  ModelAsset,
  ReferenceAsset,
} from "../src/lib/analysis/types";

const root = path.resolve("public");
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const manifest: Manifest = read(path.join(root, "data/manifest.json"));
const asset = (p: string) => read(path.join(root, manifest.base, p));
const model: ModelAsset = asset(manifest.model),
  references: ReferenceAsset[] = manifest.references.map(asset),
  evidence: EvidenceAsset = asset(manifest.evidence);
const { default: create } = await import(
  pathToFileURL(path.join(root, "wasm/vienna-2.7.2.mjs")).href
);
const engine = wrapVienna(await create());
const names: string[] = read("tests/fixtures/index.json");
function csvCells(line: string) {
  const cells: string[] = [];
  let cell = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += c;
  }
  cells.push(cell);
  return cells;
}

export function compare(
  actual: unknown,
  expected: unknown,
  location = "result",
) {
  if (location.endsWith("runtime_ms")) return;
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", location);
    const tolerance = location.includes("mfe")
      ? 1e-5
      : location.includes("layouts")
        ? 0
        : 1e-7;
    assert.ok(
      Math.abs((actual as number) - expected) <= tolerance,
      `${location}: ${actual} != ${expected} (tolerance ${tolerance})`,
    );
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), location);
    assert.equal(actual.length, expected.length, `${location}.length`);
    expected.forEach((v, i) => compare(actual[i], v, `${location}[${i}]`));
  } else if (expected && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object", location);
    for (const [key, value] of Object.entries(expected))
      compare(
        (actual as Record<string, unknown>)[key],
        value,
        `${location}.${key}`,
      );
  } else assert.equal(actual, expected, location);
}

for (const name of names) {
  test(`Python parity: ${name}`, async () => {
    const fixture: {
      text: string;
      options: AnalysisOptions;
      analysis: BrowserAnalysis;
      evidence: Record<string, unknown>;
      csv: string;
      fasta: string;
    } = read(`tests/fixtures/${name}`);
    const parsed = parseSequence(fixture.text),
      interval = parseInterval(parsed.description, parsed.sequence.length);
    const annotation = interval
      ? manifest.annotations[interval.chrom]?.[fixture.options.mask_mode]
      : undefined;
    const result = analyze(
      fixture.text,
      fixture.options,
      { model, references, exons: annotation ? asset(annotation) : undefined },
      engine,
    );
    compare(result, fixture.analysis.result);
    for (const candidate of result.export_candidates) {
      compare(
        engine.layout(candidate.dot_bracket),
        fixture.analysis.layouts[candidate.id],
        `layouts.${candidate.id}`,
      );
      compare(
        candidateEvidence(candidate, evidence),
        fixture.evidence[candidate.id],
        `evidence.${candidate.id}`,
      );
    }
    assert.equal(
      await requestKey(fixture.text, fixture.options, manifest),
      fixture.analysis.provenance.key,
    );
    assert.equal(candidatesFasta(result), fixture.fasta);
    // CSV schema/order/string cells exact; floating cells obey the scientific tolerances.
    const csv = candidatesCsv(result).trim().split("\r\n"),
      expected = fixture.csv.trim().split("\r\n");
    assert.equal(csv.length, expected.length);
    assert.equal(csv[0], expected[0]);
    for (let i = 1; i < csv.length; i++) {
      const row = csvCells(csv[i]),
        erow = csvCells(expected[i]);
      assert.equal(row.length, erow.length);
      row.forEach((cell, j) => {
        if ([7, 8, 10, 11, 13, 14].includes(j))
          compare(
            Number(cell),
            Number(erow[j]),
            `csv.${j === 7 ? "mfe" : "score"}`,
          );
        else assert.equal(cell, erow[j], `CSV ${i}:${j}`);
      });
    }
  });
}
