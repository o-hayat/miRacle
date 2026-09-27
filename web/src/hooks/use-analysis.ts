"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WORKER_PATH } from "@/lib/worker-path";
import { parseSequence } from "@/lib/analysis/sequence";
import type {
  AnalysisOptions,
  BrowserAnalysis,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/analysis/types";

export function useAnalysis() {
  const worker = useRef<Worker | null>(null),
    pending = useRef<{ id: string; reject: (error: Error) => void } | null>(
      null,
    );
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ stage: "", completed: 0, total: 0 }),
    [error, setError] = useState("");
  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    pending.current?.reject(new Error("Analysis cancelled."));
    pending.current = null;
    setBusy(false);
  }, []);
  useEffect(
    () => () => {
      worker.current?.terminate();
      pending.current?.reject(new Error("Analysis cancelled."));
      pending.current = null;
    },
    [],
  );
  const run = useCallback(
    (text: string, options: AnalysisOptions) => {
      cancel();
      setError("");
      return new Promise<BrowserAnalysis>((resolve, reject) => {
        try {
          parseSequence(text, options.input_id);
        } catch (e) {
          const error = e instanceof Error ? e : new Error("Invalid sequence");
          setError(error.message);
          reject(error);
          return;
        }
        const id = crypto.randomUUID();
        pending.current = { id, reject };
        setBusy(true);
        setProgress({
          stage: "Starting local analysis",
          completed: 0,
          total: 0,
        });
        const fail = (message: string) => {
          if (pending.current?.id !== id) return;
          worker.current?.terminate();
          worker.current = null;
          pending.current = null;
          setBusy(false);
          setError(message);
          reject(new Error(message));
        };
        try {
          const instance = new Worker(WORKER_PATH, { type: "module" });
          worker.current = instance;
          instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const message = event.data;
            if (message.id !== pending.current?.id) return;
            if (message.type === "progress") setProgress(message);
            else if (message.type === "error") fail(message.message);
            else {
              pending.current = null;
              worker.current = null;
              instance.terminate();
              setBusy(false);
              resolve(message.analysis);
            }
          };
          instance.onerror = () =>
            fail(
              "The analysis worker stopped unexpectedly. Reload and retry, or try a shorter sequence.",
            );
          instance.postMessage({
            type: "analyze",
            id,
            sequence_text: text,
            options,
          } satisfies WorkerRequest);
        } catch (e) {
          fail(
            e instanceof Error
              ? e.message
              : "This browser could not start the analysis worker.",
          );
        }
      });
    },
    [cancel],
  );
  return { run, cancel, busy, progress, error, setError };
}
