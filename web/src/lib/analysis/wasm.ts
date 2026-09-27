import type { Coordinates } from "./types";

export interface ViennaModule {
  _malloc(size: number): number;
  _free(pointer: number): void;
  HEAPF32: Float32Array;
  HEAPU8: Uint8Array;
  ccall(
    name: string,
    result: string,
    types: string[],
    args: (string | number)[],
  ): number;
  UTF8ToString(pointer: number): string;
}
export interface FoldingEngine {
  fold(sequence: string): { structure: string; mfe: number };
  layout(structure: string): Coordinates;
  memory(): number;
}
export function wrapVienna(module: ViennaModule): FoldingEngine {
  return {
    fold(sequence) {
      if (!/^[ACGU]{55,120}$/.test(sequence))
        throw new Error("Invalid folding window.");
      const ptr = module._malloc(sequence.length + 1);
      if (!ptr)
        throw new Error(
          "Not enough memory to fold this sequence. Close other tabs and retry.",
        );
      try {
        const mfe = module.ccall(
          "miracle_fold",
          "number",
          ["string", "number"],
          [sequence, ptr],
        );
        const structure = module.UTF8ToString(ptr);
        if (structure.length !== sequence.length || !Number.isFinite(mfe))
          throw new Error("ViennaRNA returned an invalid fold.");
        return { structure, mfe };
      } finally {
        module._free(ptr);
      }
    },
    layout(structure) {
      const ptr = module._malloc((structure.length + 1) * 2 * 4);
      if (!ptr) throw new Error("Not enough memory for structure layout.");
      try {
        const n = module.ccall(
          "miracle_layout",
          "number",
          ["string", "number"],
          [structure, ptr],
        );
        if (n !== structure.length)
          throw new Error("ViennaRNA could not lay out the structure.");
        return Array.from({ length: n }, (_, i) => [
          module.HEAPF32[ptr / 4 + 2 * i],
          module.HEAPF32[ptr / 4 + 2 * i + 1],
        ]);
      } finally {
        module._free(ptr);
      }
    },
    memory: () => module.HEAPU8.byteLength,
  };
}
export async function loadVienna(base = "/wasm/"): Promise<FoldingEngine> {
  try {
    const path = base + "vienna-2.7.2.mjs";
    const { default: create } = await import(/* webpackIgnore: true */ path);
    return wrapVienna(
      await create({ locateFile: (name: string) => base + name }),
    );
  } catch (error) {
    throw new Error(
      `The folding engine could not be downloaded or initialized. Check your connection and retry. ${error instanceof Error ? error.message : ""}`,
    );
  }
}
