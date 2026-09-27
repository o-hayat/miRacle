import type { AnalysisResult } from "./types";

export const CSV_FIELDS = [
  "rank",
  "id",
  "start",
  "end",
  "strand",
  "sequence_rna",
  "dot_bracket",
  "mfe_kcal_mol",
  "model_score",
  "nearest_reference",
  "identity",
  "coverage",
  "nearest_non_mirna",
  "non_mirna_identity",
  "non_mirna_coverage",
  "comparative_matches",
];
/** CPython fixed formatting: round the exact binary float, ties to even. */
export function pythonFixed(value: number, digits: number) {
  if (!Number.isFinite(value))
    throw new Error("Cannot export a non-finite score.");
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, Math.abs(value));
  const bits = buffer.getBigUint64(0),
    exponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const power = (exponent ? exponent - 1023 - 52 : -1074) + digits;
  let numerator = mantissa * 5n ** BigInt(digits),
    rounded: bigint;
  if (power >= 0) rounded = numerator << BigInt(power);
  else {
    const denominator = 1n << BigInt(-power);
    rounded = numerator / denominator;
    numerator %= denominator;
    if (
      numerator * 2n > denominator ||
      (numerator * 2n === denominator && rounded % 2n === 1n)
    )
      rounded++;
  }
  const text = rounded.toString().padStart(digits + 1, "0");
  return (
    (value < 0 || Object.is(value, -0) ? "-" : "") +
    (digits ? text.slice(0, -digits) + "." + text.slice(-digits) : text)
  );
}
function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function candidatesCsv(result: AnalysisResult) {
  const rows = result.export_candidates.map((c) => [
    c.rank,
    c.id,
    c.start,
    c.end,
    c.strand,
    c.sequence_rna,
    c.dot_bracket,
    c.mfe_kcal_mol,
    c.model_score,
    c.nearest_reference.name,
    c.nearest_reference.identity,
    c.nearest_reference.coverage,
    c.nearest_non_mirna.name,
    c.nearest_non_mirna.identity,
    c.nearest_non_mirna.coverage,
    c.comparative_matches
      .map(
        (m) =>
          `${m.species}:${m.name}:${pythonFixed(m.identity, 3)}:${pythonFixed(m.coverage, 3)}`,
      )
      .join("; "),
  ]);
  return (
    [CSV_FIELDS, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
export function candidatesFasta(result: AnalysisResult) {
  return (
    result.export_candidates
      .map(
        (c) =>
          `>${c.id} relative=${c.start}-${c.end}(${c.strand}) score=${pythonFixed(c.model_score, 4)}\n${c.sequence_rna}`,
      )
      .join("\n") + "\n"
  );
}
export function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
