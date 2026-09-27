import type { ReferenceAsset, ReferenceMatch } from "./types";

export function emptyMatch(): ReferenceMatch {
  return {
    name: "No close curated match",
    identity: 0,
    coverage: 0,
    similarity: 0,
    species: "Human",
    source: "MirGeneDB 3.0",
  };
}
export function localAlignment(
  query: string,
  reference: string,
): [number, number] {
  const cols = reference.length + 1,
    cells = (query.length + 1) * cols;
  const scores = new Int16Array(cells),
    trace = new Int8Array(cells);
  let best = 0,
    bi = 0,
    bj = 0;
  for (let i = 1; i <= query.length; i++)
    for (let j = 1; j <= reference.length; j++) {
      const k = i * cols + j,
        diagonal =
          scores[k - cols - 1] + (query[i - 1] === reference[j - 1] ? 2 : -1),
        up = scores[k - cols] - 2,
        left = scores[k - 1] - 2;
      const value = Math.max(0, diagonal, up, left);
      scores[k] = value;
      trace[k] =
        value === 0 ? 0 : value === diagonal ? 1 : value === up ? 2 : 3;
      if (value > best) {
        best = value;
        bi = i;
        bj = j;
      }
    }
  let i = bi,
    j = bj,
    matches = 0,
    aligned = 0,
    referenceBases = 0;
  while (i > 0 && j > 0 && scores[i * cols + j] > 0) {
    const d = trace[i * cols + j];
    if (d === 1) {
      aligned++;
      referenceBases++;
      matches += Number(query[i - 1] === reference[j - 1]);
      i--;
      j--;
    } else if (d === 2) {
      aligned++;
      i--;
    } else if (d === 3) {
      aligned++;
      referenceBases++;
      j--;
    } else break;
  }
  return [
    matches / Math.max(1, aligned),
    referenceBases / Math.max(1, reference.length),
  ];
}

/** NumPy 1.26 aquicksort ordering, including ties (BSD-3-Clause; see THIRD_PARTY.md). */
export function numpyArgsort(values: ArrayLike<number>): number[] {
  const indices = Array.from({ length: values.length }, (_, i) => i);
  if (!indices.length) return indices;
  const swap = (a: number, b: number) => {
    [indices[a], indices[b]] = [indices[b], indices[a]];
  };
  function heap(lo: number, hi: number) {
    const n = hi - lo + 1;
    const sink = (start: number, end: number) => {
      const saved = indices[lo + start - 1];
      let i = start;
      while (2 * i <= end) {
        let j = 2 * i;
        if (j < end && values[indices[lo + j - 1]] < values[indices[lo + j]])
          j++;
        if (values[saved] < values[indices[lo + j - 1]]) {
          indices[lo + i - 1] = indices[lo + j - 1];
          i = j;
        } else break;
      }
      indices[lo + i - 1] = saved;
    };
    for (let i = Math.floor(n / 2); i >= 1; i--) sink(i, n);
    for (let end = n; end > 1; end--) {
      swap(lo, lo + end - 1);
      sink(1, end - 1);
    }
  }
  let lo = 0,
    hi = indices.length - 1,
    depth = Math.floor(Math.log2(indices.length)) * 2;
  const stack: [number, number, number][] = [];
  for (;;) {
    if (depth < 0) heap(lo, hi);
    else {
      while (hi - lo > 15) {
        const mid = lo + ((hi - lo) >> 1);
        if (values[indices[mid]] < values[indices[lo]]) swap(mid, lo);
        if (values[indices[hi]] < values[indices[mid]]) swap(hi, mid);
        if (values[indices[mid]] < values[indices[lo]]) swap(mid, lo);
        const pivot = values[indices[mid]];
        let i = lo,
          j = hi - 1;
        swap(mid, j);
        for (;;) {
          do {
            i++;
          } while (values[indices[i]] < pivot);
          do {
            j--;
          } while (pivot < values[indices[j]]);
          if (i >= j) break;
          swap(i, j);
        }
        swap(i, hi - 1);
        depth--;
        if (i - lo < hi - i) {
          stack.push([i + 1, hi, depth]);
          hi = i - 1;
        } else {
          stack.push([lo, i - 1, depth]);
          lo = i + 1;
        }
      }
      for (let i = lo + 1; i <= hi; i++) {
        const index = indices[i],
          v = values[index];
        let j = i;
        while (j > lo && v < values[indices[j - 1]]) {
          indices[j] = indices[j - 1];
          j--;
        }
        indices[j] = index;
      }
    }
    const next = stack.pop();
    if (!next) break;
    [lo, hi, depth] = next;
  }
  return indices;
}

export function matchReference(
  query: string,
  asset: ReferenceAsset,
): ReferenceMatch {
  if (!asset.records.length) return emptyMatch();
  const counts = new Map<number, number>();
  for (let n = 4; n <= 6; n++)
    for (let i = 0; i <= query.length - n; i++) {
      const index = asset.vocabulary[query.slice(i, i + n)];
      if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1);
    }
  const vector = new Float64Array(asset.idf.length);
  let norm = 0;
  for (const [index, count] of [...counts].sort((a, b) => a[0] - b[0])) {
    vector[index] = count * asset.idf[index];
    norm += vector[index] ** 2;
  }
  norm = Math.sqrt(norm);
  if (norm) for (const index of counts.keys()) vector[index] /= norm;
  const similarities = new Float64Array(asset.records.length);
  for (let row = 0; row < asset.records.length; row++)
    for (let k = asset.indptr[row]; k < asset.indptr[row + 1]; k++)
      similarities[row] += asset.data[k] * vector[asset.indices[k]];
  const shortlist = numpyArgsort(similarities).slice(-5).reverse();
  let best = emptyMatch(),
    key = [-1, -1, -1];
  for (const index of shortlist) {
    const [identity, coverage] = localAlignment(query, asset.records[index][1]);
    const similarity = similarities[index];
    const next = [identity * coverage, identity, similarity];
    const better =
      next[0] > key[0] ||
      (next[0] === key[0] &&
        (next[1] > key[1] || (next[1] === key[1] && next[2] > key[2])));
    if (better) {
      key = next;
      best = {
        name: asset.records[index][0],
        identity,
        coverage,
        similarity,
        species: asset.species,
        source: asset.source,
      };
    }
  }
  return best;
}
