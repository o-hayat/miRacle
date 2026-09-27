import { reverseComplement } from "./sequence";
import type { CandidateResult, EvidenceAsset, EvidenceRow } from "./types";

export function externalRows(c: CandidateResult, data: EvidenceAsset) {
  return data.external
    .filter(([precursor]) => {
      const reverse = reverseComplement(precursor),
        sequence = c.sequence_rna;
      return (
        precursor.includes(sequence) ||
        sequence.includes(precursor) ||
        reverse.includes(sequence) ||
        sequence.includes(reverse)
      );
    })
    .map(([, row]) => row);
}
export function matureArms(
  c: CandidateResult,
  data: EvidenceAsset,
): [string, string][] {
  const external = externalRows(c, data);
  if (external.length) {
    const seen = new Set<string>();
    return external.flatMap((row) => {
      const item: [string, string] = [row.mature_mirna, row.mature_sequence],
        key = JSON.stringify(item);
      if (seen.has(key)) return [];
      seen.add(key);
      return [item];
    });
  }
  const m = c.nearest_reference;
  if (m.identity < 0.95 || m.coverage < 0.9 || m.name.startsWith("No close"))
    return [];
  const prefix = m.name.replace(/_pre$/, "");
  return data.mature.filter(([name]) => name.startsWith(prefix + "_"));
}
export function literatureContext(c: CandidateResult, data: EvidenceAsset) {
  const m = c.nearest_reference;
  if (m.identity < 0.9 || m.coverage < 0.85) return null;
  const row = data.literature.find((r) =>
    m.name.startsWith(r.reference_prefix),
  );
  if (!row) return null;
  return {
    display_name: row.display_name,
    summary: row.summary,
    evidence: row.evidence,
    caveat: row.caveat,
    source_label: row.source_label,
    source_url: row.source_url,
  };
}
export function machineryEvidence(c: CandidateResult, data: EvidenceAsset) {
  return externalRows(c, data).map((r) => ({
    mature_mirna: r.mature_mirna,
    protein: r.protein,
    result: r.result,
    evidence_type: r.evidence_type,
    experiment: r.experiment,
    biological_context: r.biological_context,
    reference: `PMID ${r.pmid}`,
    source_url: r.source_url,
  }));
}
export function evidenceLevel(
  c: CandidateResult,
  data: EvidenceAsset,
): [string, string] {
  const m = c.nearest_reference,
    d = c.nearest_non_mirna;
  if (d.identity >= 0.9 && d.coverage >= 0.85)
    return ["Conflicting", "Close to a curated non-miRNA Rfam sequence."];
  if (externalRows(c, data).length)
    return [
      "External control + machinery evidence",
      "Exact sequence from an independent NCBI RefSeq precursor control with a primary study testing at least one miRNA-pathway protein.",
    ];
  if (m.identity >= 0.95 && m.coverage >= 0.9)
    return [
      "Known-like",
      "Near-exact curated precursor match; functional evidence is still separate.",
    ];
  if (c.model_score >= 0.8)
    return [
      "Computational",
      "Strong sequence/structure resemblance without independent biological evidence.",
    ];
  return [
    "Preliminary",
    "Passes loose hairpin screening but has limited supporting evidence.",
  ];
}
export function validatedTargets(c: CandidateResult, data: EvidenceAsset) {
  const accepted = new Set(
    matureArms(c, data).flatMap(([name]) => {
      if (
        name.includes("-P") ||
        name.includes("-v") ||
        !name.startsWith("Hsa-Mir-") ||
        !name.includes("_")
      )
        return [];
      const last = name.lastIndexOf("_");
      return [
        (
          name.slice(0, last).replace("Hsa-Mir-", "hsa-miR-") +
          "-" +
          name.slice(last + 1)
        ).toLowerCase(),
      ];
    }),
  );
  function field(row: EvidenceRow, ...needles: string[]) {
    return (
      Object.entries(row).find(([key]) =>
        needles.every((n) =>
          key.toLowerCase().replaceAll("_", " ").includes(n),
        ),
      )?.[1] ?? ""
    ).trim();
  }
  return data.targets
    .filter((r) => accepted.has(field(r, "mirna").toLowerCase()))
    .slice(0, 12)
    .map((r) => {
      const gene = field(r, "target", "gene") || field(r, "target"),
        reference = field(r, "reference") || field(r, "pmid");
      return {
        mature_mirna: field(r, "mirna"),
        target_gene: gene,
        target_protein: gene,
        experiments: field(r, "experiment"),
        support_type: field(r, "support"),
        reference,
        source_url: reference.startsWith("http") ? reference : "",
        external_control: false,
      };
    });
}
export function candidateEvidence(c: CandidateResult, data: EvidenceAsset) {
  return {
    level: evidenceLevel(c, data),
    arms: matureArms(c, data),
    machinery: machineryEvidence(c, data),
    targets: validatedTargets(c, data),
    literature: literatureContext(c, data),
  };
}
