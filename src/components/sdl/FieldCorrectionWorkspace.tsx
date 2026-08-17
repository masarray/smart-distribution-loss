import { useState } from "react";
import { FieldCorrectionPanel, type FieldCorrectionRunState } from "@/components/sdl/FieldCorrectionPanel";
import { createFieldCorrectionAuditTrail } from "@/lib/sdl/fieldAudit";
import { runFieldDatasetCandidate } from "@/lib/sdl/fieldCandidateRunner";
import {
  buildFieldCorrectionCandidate,
  decorateFieldCorrectionResult,
  defaultFieldCorrectionParameter,
  deriveFieldCorrectionComparison,
  fieldCorrectionCurrentValue,
  fieldCorrectionDefinitions,
  fieldCorrectionInputError,
  removeFieldCorrectionEntry,
  upsertFieldCorrectionDraft,
  type FieldCorrectionComparison,
  type FieldCorrectionDraft,
  type FieldCorrectionParameter,
} from "@/lib/sdl/fieldCorrection";
import type { FieldInvestigationPlan } from "@/lib/sdl/fieldInvestigation";
import type {
  FieldMeasurementContext,
  FieldMeasurementRecord,
  FieldMeasurementReconciliation,
} from "@/lib/sdl/fieldMeasurement";
import {
  activateFieldOperational,
  createFieldOperationalSession,
  useFieldOperationalSession,
  type FieldOperationalSession,
} from "@/lib/sdl/fieldOperational";

interface Props {
  plan: FieldInvestigationPlan;
  context: FieldMeasurementContext | null;
  record: FieldMeasurementRecord | null;
  reconciliation: FieldMeasurementReconciliation | null;
}

interface CorrectionFormState {
  parameter: FieldCorrectionParameter;
  proposedValue: string;
  evidence: string;
  verified: boolean;
}

interface CandidateState {
  testedVersion: number | null;
  runState: FieldCorrectionRunState;
  progress: { percent: number; label: string; detail: string };
  error: string | null;
  comparison: FieldCorrectionComparison | null;
  session: FieldOperationalSession | null;
}

const EMPTY_CANDIDATE: CandidateState = {
  testedVersion: null,
  runState: "idle",
  progress: { percent: 0, label: "Belum dihitung", detail: "" },
  error: null,
  comparison: null,
  session: null,
};

export function FieldCorrectionWorkspace({ plan, context, record, reconciliation }: Props) {
  const session = useFieldOperationalSession();
  const [forms, setForms] = useState<Record<string, CorrectionFormState>>({});
  const [drafts, setDrafts] = useState<Record<string, FieldCorrectionDraft>>({});
  const [candidates, setCandidates] = useState<Record<string, CandidateState>>({});

  if (!session) return null;

  const ready = Boolean(context && reconciliation?.status === "DISCREPANCY");
  const definitions = fieldCorrectionDefinitions(plan.elementType);
  const defaultParameter = defaultFieldCorrectionParameter(
    plan.elementType,
    reconciliation?.loading.status === "DISCREPANCY",
  );
  const storedForm = forms[plan.elementId];
  const form: CorrectionFormState = storedForm ?? {
    parameter: defaultParameter,
    proposedValue: "",
    evidence: record?.reference ?? "",
    verified: false,
  };
  const definition = definitions.find((item) => item.parameter === form.parameter) ?? definitions[0] ?? null;
  const beforeValue = definition ? fieldCorrectionCurrentValue(session, plan.elementId, definition.parameter) : null;
  const proposedValue = parseCandidateNumber(form.proposedValue);
  const inputError = ready
    ? fieldCorrectionInputError({
        beforeValue,
        proposedValue,
        evidence: form.evidence,
        verified: form.verified,
        definition,
      })
    : null;
  const storedDraft = drafts[plan.elementId] ?? null;
  const draft = storedDraft?.baselineActivatedAt === session.activatedAt ? storedDraft : null;
  const candidate = candidates[plan.elementId] ?? EMPTY_CANDIDATE;
  const candidateActivatable = Boolean(
    ready &&
    context &&
    reconciliation?.status === "DISCREPANCY" &&
    candidate.session &&
    candidate.comparison &&
    draft &&
    candidate.testedVersion === draft.version,
  );

  const updateForm = (patch: Partial<CorrectionFormState>) => {
    setForms((current) => ({
      ...current,
      [plan.elementId]: { ...form, ...patch },
    }));
  };

  const saveRevision = () => {
    if (!ready || !context || !definition || proposedValue == null || inputError) return;
    const next = upsertFieldCorrectionDraft(
      draft,
      session,
      plan,
      context,
      record,
      definition,
      proposedValue,
      form.evidence,
    );
    setDrafts((current) => ({ ...current, [plan.elementId]: next }));
    setForms((current) => ({
      ...current,
      [plan.elementId]: { ...form, proposedValue: "", verified: false },
    }));
  };

  const removeEntry = (parameter: FieldCorrectionParameter) => {
    if (!draft) return;
    const next = removeFieldCorrectionEntry(draft, parameter);
    setDrafts((current) => ({ ...current, [plan.elementId]: next }));
  };

  const runCandidate = async () => {
    if (!draft?.entries.length || candidate.runState === "running") return;
    const candidateInput = buildFieldCorrectionCandidate(session, draft);
    if (!candidateInput.fieldImport.report.valid || !candidateInput.fieldImport.report.solverReady) {
      setCandidates((current) => ({
        ...current,
        [plan.elementId]: {
          ...EMPTY_CANDIDATE,
          testedVersion: draft.version,
          runState: "error",
          error: candidateInput.fieldImport.report.errors[0] ?? "Draft koreksi tidak lolos validasi dataset.",
        },
      }));
      return;
    }
    if (!candidateInput.topologySupported) {
      setCandidates((current) => ({
        ...current,
        [plan.elementId]: {
          ...EMPTY_CANDIDATE,
          testedVersion: draft.version,
          runState: "error",
          error: candidateInput.topologyReason ?? "Draft koreksi membuat topology tidak didukung.",
        },
      }));
      return;
    }

    setCandidates((current) => ({
      ...current,
      [plan.elementId]: {
        ...EMPTY_CANDIDATE,
        testedVersion: draft.version,
        runState: "running",
        progress: { percent: 2, label: "Menyiapkan kandidat", detail: "Baseline tetap aktif" },
      },
    }));

    try {
      const rawResult = await runFieldDatasetCandidate(candidateInput.dataset, (progress) => {
        setCandidates((current) => ({
          ...current,
          [plan.elementId]: {
            ...(current[plan.elementId] ?? EMPTY_CANDIDATE),
            testedVersion: draft.version,
            runState: "running",
            progress,
            error: null,
          },
        }));
      });
      const result = decorateFieldCorrectionResult(rawResult, session, draft);
      const comparison = deriveFieldCorrectionComparison(session, result, draft);
      const candidateSession = createFieldOperationalSession(candidateInput.fieldImport, result);
      setCandidates((current) => ({
        ...current,
        [plan.elementId]: {
          testedVersion: draft.version,
          runState: "done",
          progress: { percent: 100, label: "Kandidat selesai", detail: result.gate.summary },
          error: candidateSession ? null : `Kandidat v${draft.version} selesai dihitung tetapi tidak memenuhi activation gate.`,
          comparison,
          session: candidateSession,
        },
      }));
    } catch (error) {
      setCandidates((current) => ({
        ...current,
        [plan.elementId]: {
          ...EMPTY_CANDIDATE,
          testedVersion: draft.version,
          runState: "error",
          error: error instanceof Error ? error.message : "Perhitungan kandidat gagal.",
        },
      }));
    }
  };

  const activateCandidate = () => {
    if (!candidateActivatable || !draft || !context || !candidate.session || !candidate.comparison || !reconciliation) return;
    const auditTrail = createFieldCorrectionAuditTrail({
      baseline: session,
      candidate: candidate.session,
      draft,
      comparison: candidate.comparison,
      context,
      record,
      reconciliation,
    });
    activateFieldOperational({ ...candidate.session, auditTrail });
  };

  const discardCandidate = () => {
    setCandidates((current) => ({ ...current, [plan.elementId]: EMPTY_CANDIDATE }));
  };

  return (
    <FieldCorrectionPanel
      elementId={plan.elementId}
      elementType={plan.elementType}
      ready={ready}
      definitions={definitions}
      parameter={form.parameter}
      beforeValue={beforeValue}
      proposedValue={form.proposedValue}
      evidence={form.evidence}
      verified={form.verified}
      inputError={inputError}
      draft={draft}
      testedVersion={candidate.testedVersion}
      runState={candidate.runState}
      progress={candidate.progress}
      runError={candidate.error}
      comparison={candidate.comparison}
      candidateActivatable={candidateActivatable}
      onParameterChange={(parameter) => updateForm({ parameter, proposedValue: "", verified: false })}
      onProposedChange={(proposedValue) => updateForm({ proposedValue })}
      onEvidenceChange={(evidence) => updateForm({ evidence })}
      onVerifiedChange={(verified) => updateForm({ verified })}
      onSaveRevision={saveRevision}
      onRemoveEntry={removeEntry}
      onRunCandidate={() => void runCandidate()}
      onActivateCandidate={activateCandidate}
      onDiscardCandidate={discardCandidate}
    />
  );
}

function parseCandidateNumber(raw: string) {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
