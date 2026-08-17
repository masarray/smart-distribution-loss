import type { FieldDatasetResult, FieldDatasetV1 } from "./fieldDataset";

export interface FieldCandidateProgress {
  percent: number;
  label: string;
  detail: string;
}

export function runFieldDatasetCandidate(
  dataset: FieldDatasetV1,
  onProgress?: (progress: FieldCandidateProgress) => void,
): Promise<FieldDatasetResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`${import.meta.env.BASE_URL}field-worker.js`);
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Perhitungan kandidat melewati batas waktu."));
    }, 10 * 60 * 1000);

    const finish = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data ?? {};
      if (data.type === "field-progress") {
        onProgress?.({
          percent: Number(data.percent) || 0,
          label: String(data.label ?? "Menghitung kandidat"),
          detail: String(data.detail ?? ""),
        });
        return;
      }
      if (data.type === "field-result") {
        finish();
        resolve(data.payload as FieldDatasetResult);
        return;
      }
      if (data.type === "field-error") {
        finish();
        reject(new Error(String(data.message ?? "Perhitungan kandidat gagal.")));
      }
    };

    worker.onerror = () => {
      finish();
      reject(new Error("Mesin perhitungan kandidat gagal dijalankan."));
    };

    worker.postMessage({ type: "run-field-dataset", dataset });
  });
}
