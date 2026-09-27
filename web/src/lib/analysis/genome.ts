import type { Example } from "./types";
import { parseInterval, parseSequence } from "./sequence";

export const CHROMOSOMES: Record<string, number> = {
  chr1: 248956422,
  chr2: 242193529,
  chr3: 198295559,
  chr4: 190214555,
  chr5: 181538259,
  chr6: 170805979,
  chr7: 159345973,
  chr8: 145138636,
  chr9: 138394717,
  chr10: 133797422,
  chr11: 135086622,
  chr12: 133275309,
  chr13: 114364328,
  chr14: 107043718,
  chr15: 101991189,
  chr16: 90338345,
  chr17: 83257441,
  chr18: 80373285,
  chr19: 58617616,
  chr20: 64444167,
  chr21: 46709983,
  chr22: 50818468,
  chrX: 156040895,
  chrY: 57227415,
};
export function validateRegion(chromosome: string, start: number, end: number) {
  const suffix = chromosome.trim().replace(/^chr/i, "");
  const chrom =
    "chr" +
    (/^\d+$/.test(suffix) ? String(Number(suffix)) : suffix.toUpperCase());
  if (!CHROMOSOMES[chrom])
    throw new Error(`${chromosome} is not a supported GRCh38 chromosome.`);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end))
    throw new Error("Coordinates must be whole numbers.");
  if (start < 1) throw new Error("Start index must be at least 1.");
  if (end < start)
    throw new Error(
      "End index must be greater than or equal to the start index.",
    );
  if (end > CHROMOSOMES[chrom])
    throw new Error(
      `End index exceeds the GRCh38 length of ${chrom} (${CHROMOSOMES[chrom].toLocaleString("en-US")} nt).`,
    );
  const length = end - start + 1;
  if (length < 55)
    throw new Error(
      "The selected region must be at least 55 nucleotides long.",
    );
  if (length > 20000)
    throw new Error(
      `The selected region is ${length.toLocaleString("en-US")} nt; the interactive limit is 20,000 nt.`,
    );
  return { chrom, start, end };
}
export async function fetchRegion(
  chromosome: string,
  start: number,
  end: number,
  examples: Example[],
  signal?: AbortSignal,
) {
  const { chrom } = validateRegion(chromosome, start, end);
  let sequence: string | undefined;
  for (const example of [...examples].sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const p = parseSequence(example.text),
      interval = parseInterval(p.description, p.sequence.length);
    if (
      interval &&
      interval.chrom === chrom &&
      interval.start <= start &&
      interval.end >= end
    ) {
      sequence = p.sequence
        .slice(start - interval.start, end - interval.start + 1)
        .replaceAll("U", "T");
      break;
    }
  }
  if (!sequence) {
    try {
      const params = new URLSearchParams({
        genome: "hg38",
        chrom,
        start: String(start - 1),
        end: String(end),
      });
      const response = await fetch(
        `https://api.genome.ucsc.edu/getData/sequence?${params}`,
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      sequence = String(payload.dna ?? "").toUpperCase();
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(
        "This hg38 region is not bundled locally and could not be downloaded from UCSC. Check the internet connection or paste the sequence manually.",
      );
    }
    if (sequence.length !== end - start + 1 || !/^[ACGTN]+$/.test(sequence))
      throw new Error(
        "UCSC returned an incomplete or invalid sequence for this interval.",
      );
  }
  return `>hg38_${chrom}_${start}_${end} ${chrom}:${start}-${end} hg38\n${sequence}\n`;
}
