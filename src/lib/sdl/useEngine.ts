import { useCallback, useEffect, useRef, useState } from "react";
import type { P3Result, Preset, SpotDemo } from "./types";

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
  result: null,
  error: null,
  elapsedMs: null,
};

export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const startedRef = useRef<number>(0);
  const [state, setState] = useState<EngineState>(initialState);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((preset: Preset) => {
    if (typeof window === "undefined") return;
    workerRef.current?.terminate();
    const worker = new Worker(`${import.meta.env.BASE_URL}sdl-worker.js`);
    workerRef.current = worker;
    startedRef.current = performance.now();

    setState({
      ...initialState,
      status: "running",
      stages: STAGE_LABELS.map((s) => ({ ...s, done: false })),
      progress: { percent: 2, label: "Booting physics runtime", detail: "Pyodide · CPython WebAssembly" },
    });

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data ?? {};
      if (data.type === "progress") {
        setState((prev) => ({
          ...prev,
          progress: { percent: Number(data.percent) || 0, label: data.label, detail: data.detail ?? "" },
        }));
      } else if (data.type === "spot-demo") {
        setState((prev) => ({ ...prev, spot: data.payload as SpotDemo }));
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
          intervals: { done: 96, total: 96 },
          stages: prev.stages.map((s) => ({ ...s, done: true })),
          progress: { percent: 100, label: "Analysis complete", detail: "96/96 three-phase power flows solved" },
          elapsedMs: performance.now() - startedRef.current,
        }));
        worker.terminate();
        workerRef.current = null;
      } else if (data.type === "error") {
        setState((prev) => ({ ...prev, status: "error", error: String(data.message ?? "Unknown engine error") }));
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (err) => {
      setState((prev) => ({ ...prev, status: "error", error: err.message || "Worker failed to start" }));
    };

    worker.postMessage({ type: "run-p3", preset });
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState((prev) => ({ ...prev, status: "idle", progress: { ...prev.progress, label: "Dibatalkan", detail: "" } }));
  }, []);

  return { state, run, cancel };
}
