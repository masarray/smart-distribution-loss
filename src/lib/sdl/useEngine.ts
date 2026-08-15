import { useCallback, useEffect, useRef, useState } from "react";
import type { P3Result, Preset, SpotDemo, TmDemo } from "./types";

export interface EngineProgress {
  percent: number;
  label: string;
  detail: string;
}

export interface EngineState {
  status: "idle" | "running" | "done" | "error";
  progress: EngineProgress;
  stages: { label: string; detail: string; done: boolean }[];
  intervals: { done: number; total: number };
  spot: SpotDemo | null;
  tm: TmDemo | null;
  result: P3Result | null;
  error: string | null;
  elapsedMs: number | null;
}

const STAGE_LABELS = [
  { label: "Timestamp alignment", detail: "±15 min correction for flagged streams only" },
  { label: "Missing-AMI reconstruction", detail: "Bounded category scales fitted to feeder P" },
  { label: "Unknown-phase inference", detail: "Coordinate descent vs measured phase P" },
  { label: "Reactive-power anchors", detail: "16 sparse physics solves for network-Q" },
  { label: "Unknown-PF calibration", detail: "Bounded least squares vs noisy feeder Q" },
  { label: "Network parameter fit", detail: "Transformer Pfe against 3φ physics" },
  { label: "Smart model build", detail: "Rebuild Pandapower model from calibrated state" },
];

const initialState: EngineState = {
  status: "idle",
  progress: { percent: 0, label: "Standby", detail: "Pandapower 3φ engine belum dijalankan." },
  stages: STAGE_LABELS.map((s) => ({ ...s, done: false })),
  intervals: { done: 0, total: 96 },
  spot: null,
  tm: null,
  result: null,
  error: null,
  elapsedMs: null,
};

export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const startedRef = useRef<number>(0);
  const [state, setState] = useState<EngineState>(initialState);

  const destroyWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(`${import.meta.env.BASE_URL}sdl-worker.js`);
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data ?? {};
      if (data.type === "progress") {
        setState((prev) => ({
          ...prev,
          progress: {
            percent: Number(data.percent) || 0,
            label: data.label,
            detail: data.detail ?? "",
          },
        }));
      } else if (data.type === "spot-demo") {
        setState((prev) => ({ ...prev, spot: data.payload as SpotDemo }));
      } else if (data.type === "tm-demo") {
        setState((prev) => ({ ...prev, tm: data.payload as TmDemo }));
      } else if (data.type === "p3-stage") {
        setState((prev) => ({
          ...prev,
          stages: prev.stages.map((s, i) => (i <= Number(data.index) ? { ...s, done: true } : s)),
        }));
      } else if (data.type === "p3-step") {
        setState((prev) => ({
          ...prev,
          intervals: { done: Number(data.index) + 1, total: Number(data.total) || 96 },
        }));
      } else if (data.type === "result") {
        setState((prev) => ({
          ...prev,
          status: "done",
          result: data.payload as P3Result,
          spot: (data.payload?.spot_load_demo as SpotDemo) ?? prev.spot,
          tm: (data.payload?.tm_customer_demo as TmDemo) ?? prev.tm,
          intervals: { done: 96, total: 96 },
          stages: prev.stages.map((s) => ({ ...s, done: true })),
          progress: {
            percent: 100,
            label: "Analysis complete",
            detail: "Runtime warm · siap untuk simulasi berikutnya tanpa reboot Pyodide",
          },
          elapsedMs: performance.now() - startedRef.current,
        }));
      } else if (data.type === "error") {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: String(data.message ?? "Unknown engine error"),
        }));
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    };

    worker.onerror = (err) => {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err.message || "Worker failed to start",
      }));
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    return worker;
  }, []);

  useEffect(() => destroyWorker, [destroyWorker]);

  const run = useCallback(
    (preset: Preset) => {
      if (typeof window === "undefined") return;

      const warmStart = workerRef.current !== null;
      const worker = getWorker();
      startedRef.current = performance.now();

      setState({
        ...initialState,
        status: "running",
        stages: STAGE_LABELS.map((s) => ({ ...s, done: false })),
        progress: warmStart
          ? {
              percent: 4,
              label: "Reusing warm physics runtime",
              detail: "Pyodide · Pandapower · Python engines sudah resident di worker",
            }
          : {
              percent: 2,
              label: "Booting physics runtime",
              detail: "Pyodide · CPython WebAssembly",
            },
      });

      worker.postMessage({ type: "run-p3", preset });
    },
    [getWorker],
  );

  const cancel = useCallback(() => {
    destroyWorker();
    setState((prev) => ({
      ...prev,
      status: "idle",
      progress: { ...prev.progress, label: "Dibatalkan", detail: "Runtime worker di-reset." },
    }));
  }, [destroyWorker]);

  return { state, run, cancel };
}
