export const MAX_SEQUENCE_LENGTH = 20_000;
export function parseSequence(text: string, fallback = "input_sequence") {
  if (!text.trim()) throw new Error("Please paste or upload a sequence.");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.filter((l) => l.startsWith(">")).length > 1)
    throw new Error("miRacle accepts exactly one FASTA record at a time.");
  let identifier = fallback,
    description = "",
    sequence = "";
  for (const line of lines) {
    if (line.startsWith(">")) {
      description = line.slice(1).trim();
      identifier = description.split(/\s+/)[0] || fallback;
    } else sequence += line.replace(/\s/g, "");
  }
  sequence = sequence.toUpperCase().replaceAll("T", "U");
  if (!sequence)
    throw new Error("The input contains a header but no sequence.");
  if (!/^[ACGUN]+$/.test(sequence))
    throw new Error(
      `Unsupported character(s): ${[...new Set(sequence.replace(/[ACGUN]/g, ""))].sort().join(", ")}. Use only A, C, G, T, U, or N.`,
    );
  if (sequence.length < 55)
    throw new Error("Sequence is too short; provide at least 55 nucleotides.");
  if (sequence.length > MAX_SEQUENCE_LENGTH)
    throw new Error(
      "Sequence is too long for this prototype; the maximum is 20,000 nt.",
    );
  return { identifier, description, sequence };
}
export function inferInputType(text: string): "rna" | "genomic" {
  const sequence = text
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith(">"))
    .join("")
    .replace(/\s/g, "")
    .toUpperCase();
  return sequence.includes("U") && !sequence.includes("T") ? "rna" : "genomic";
}
export function reverseComplement(sequence: string) {
  const pairs: Record<string, string> = {
    A: "U",
    C: "G",
    G: "C",
    U: "A",
    N: "N",
  };
  return [...sequence]
    .reverse()
    .map((c) => pairs[c] ?? c)
    .join("");
}
export function validSegments(sequence: string): [number, string][] {
  const result: [number, string][] = [];
  let offset = 0;
  for (const part of sequence.split("N")) {
    if (part.length >= 55) result.push([offset, part]);
    offset += part.length + 1;
  }
  return result;
}
export function reverseCoordinates(
  start: number,
  end: number,
  length: number,
): [number, number] {
  return [length - end + 1, length - start + 1];
}
export function parseInterval(description: string, length: number) {
  if (!/\b(hg38|GRCh38)\b/i.test(description)) return null;
  const m = /(chr(?:[0-9]{1,2}|X|Y|M)):([0-9,]+)-([0-9,]+)/i.exec(description);
  if (!m) return null;
  const start = Number(m[2].replaceAll(",", "")),
    end = Number(m[3].replaceAll(",", ""));
  if (start < 1 || end < start || end - start + 1 !== length) return null;
  const chrom = "chr" + m[1].slice(3).toUpperCase();
  return {
    chrom,
    start,
    end,
    label: `${chrom}:${start.toLocaleString("en-US")}-${end.toLocaleString("en-US")} (hg38)`,
  };
}
export type Exon = [number, number, string];
export function maskSequence(
  sequence: string,
  start: number,
  end: number,
  exons: Exon[],
) {
  const masked = [...sequence],
    genes = new Set<string>();
  const queryStart = start - 1;
  for (const [left, right, symbols] of exons) {
    if (left >= end) break;
    if (right <= queryStart) continue;
    const a = Math.max(left, queryStart) - queryStart,
      b = Math.min(right, end) - queryStart;
    if (a >= b) continue;
    masked.fill("N", a, b);
    symbols
      .split(",")
      .filter(Boolean)
      .forEach((g) => genes.add(g));
  }
  return {
    sequence: masked.join(""),
    masked_nt: masked.filter((c, i) => c === "N" && sequence[i] !== "N").length,
    genes: [...genes].sort(),
  };
}
