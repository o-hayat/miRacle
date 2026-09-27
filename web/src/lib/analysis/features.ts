import type { FoldHit } from "./types";

export function pairTable(structure: string) {
  const table = Array<number>(structure.length).fill(-1),
    stack: number[] = [];
  for (let i = 0; i < structure.length; i++) {
    const c = structure[i];
    if (c === "(") stack.push(i);
    else if (c === ")") {
      const j = stack.pop();
      if (j === undefined)
        throw new Error(
          "Unbalanced closing parenthesis in dot-bracket structure.",
        );
      table[i] = j;
      table[j] = i;
    } else if (c !== ".")
      throw new Error(`Unsupported dot-bracket character: ${c}`);
  }
  if (stack.length)
    throw new Error("Unbalanced opening parenthesis in dot-bracket structure.");
  return table;
}

export function structureStats(structure: string) {
  const table = pairTable(structure);
  const pairs = table.flatMap((j, i) => (j > i ? [[i, j]] : []));
  let longest = 0,
    branches = 0,
    depth = 0;
  for (const [i, j] of pairs) {
    let length = 1;
    while (table[i + length] === j - length && i + length < j - length)
      length++;
    longest = Math.max(longest, length);
  }
  for (const c of structure) {
    if (c === "(") {
      if (depth === 0) branches++;
      depth++;
    } else if (c === ")") depth--;
  }
  const loops = pairs.filter(
    ([i, j]) =>
      !table
        .slice(i + 1, j)
        .some((partner, k) => partner > i + 1 + k && partner < j),
  );
  const center = (structure.length - 1) / 2;
  loops.sort(
    (a, b) =>
      Math.abs((a[0] + a[1]) / 2 - center) -
      Math.abs((b[0] + b[1]) / 2 - center),
  );
  const loop = loops[0];
  let unpaired = 0,
    runs = 0,
    inRun = false;
  if (pairs.length) {
    const [a, b] = pairs[0];
    for (let i = a + 1; i < b; i++) {
      if (table[i] < 0 && !(loop && i > loop[0] && i < loop[1])) {
        unpaired++;
        if (!inRun) runs++;
        inRun = true;
      } else inRun = false;
    }
  }
  return {
    pair_table: table,
    pair_count: pairs.length,
    paired_fraction: structure.length
      ? (2 * pairs.length) / structure.length
      : 0,
    longest_stem: longest,
    terminal_loop_size: loop ? loop[1] - loop[0] - 1 : 0,
    internal_unpaired_fraction: pairs.length
      ? unpaired / Math.max(1, pairs[0][1] - pairs[0][0] - 1)
      : 1,
    internal_unpaired_runs: runs,
    top_level_stems: branches,
  };
}

export function extractFeatures(hit: FoldHit): Record<string, number> {
  const sequence = hit.sequence.toUpperCase().replaceAll("T", "U"),
    n = sequence.length;
  const stats = structureStats(hit.structure),
    counts: Record<string, number> = {},
    dinucs: Record<string, number> = {};
  let homopolymer = 1,
    longest = 1;
  for (let i = 0; i < n; i++) {
    const c = sequence[i];
    counts[c] = (counts[c] ?? 0) + 1;
    if (i) {
      homopolymer = sequence[i - 1] === c ? homopolymer + 1 : 1;
      longest = Math.max(longest, homopolymer);
    }
    if (i < n - 1) {
      const d = sequence.slice(i, i + 2);
      dinucs[d] = (dinucs[d] ?? 0) + 1;
    }
  }
  let entropy = 0;
  for (const count of Object.values(counts))
    entropy -= (count / n) * Math.log2(count / n);
  let gc = 0,
    au = 0,
    gu = 0;
  stats.pair_table.forEach((j, i) => {
    if (j > i) {
      const p = [sequence[i], sequence[j]].sort().join("");
      if (p === "CG") gc++;
      else if (p === "AU") au++;
      else if (p === "GU") gu++;
    }
  });
  const den = Math.max(1, stats.pair_count);
  const f: Record<string, number> = {
    length: n,
    gc_fraction: ((counts.G ?? 0) + (counts.C ?? 0)) / n,
    a_fraction: (counts.A ?? 0) / n,
    c_fraction: (counts.C ?? 0) / n,
    g_fraction: (counts.G ?? 0) / n,
    u_fraction: (counts.U ?? 0) / n,
    sequence_entropy: entropy,
    max_homopolymer: longest,
    mfe: hit.mfe,
    mfe_per_nt: hit.mfe / n,
    pair_count: stats.pair_count,
    paired_fraction: stats.paired_fraction,
    longest_stem: stats.longest_stem,
    terminal_loop_size: stats.terminal_loop_size,
    internal_unpaired_fraction: stats.internal_unpaired_fraction,
    internal_unpaired_runs: stats.internal_unpaired_runs,
    top_level_stems: stats.top_level_stems,
    gc_pair_fraction: gc / den,
    au_pair_fraction: au / den,
    gu_pair_fraction: gu / den,
  };
  for (const a of "ACGU")
    for (const b of "ACGU")
      f[`dinuc_${a.toLowerCase()}${b.toLowerCase()}`] =
        (dinucs[a + b] ?? 0) / Math.max(1, n - 1);
  return f;
}
export function passesGate(f: Record<string, number>) {
  return (
    f.length >= 55 &&
    f.length <= 120 &&
    f.pair_count >= 16 &&
    f.paired_fraction >= 0.35 &&
    f.terminal_loop_size >= 3 &&
    f.terminal_loop_size <= 30 &&
    f.top_level_stems === 1 &&
    f.mfe_per_nt <= -0.15
  );
}
