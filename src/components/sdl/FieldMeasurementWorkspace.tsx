import { useState } from "react";
import { FieldCorrectionWorkspace } from "@/components/sdl/FieldCorrectionWorkspace";
import { FieldMeasurementPanel } from "@/components/sdl/FieldMeasurementPanel";
import type { FieldInvestigationPlan } from "@/lib/sdl/fieldInvestigation";
import {
  deriveFieldMeasurementContext,
  fieldMeasurementIntervals,
  fieldMeasurementRecordKey,
  reconcileFieldMeasurement,
  type FieldMeasurementRecord,
  type FieldMeasurementSide,
} from "@/lib/sdl/fieldMeasurement";
import { openDatasetManager, useFieldOperationalSession } from "@/lib/sdl/fieldOperational";

interface Props {
  plan: FieldInvestigationPlan;
}

interface MeasurementTarget {
  time: string;
  side: FieldMeasurementSide;
}

export function FieldMeasurementWorkspace({ plan }: Props) {
  const session = useFieldOperationalSession();
  const [targets, setTargets] = useState<Record<string, MeasurementTarget>>({});
  const [records, setRecords] = useState<Record<string, FieldMeasurementRecord>>({});

  if (!session) return null;

  const intervals = fieldMeasurementIntervals(session, plan.elementId);
  const storedTarget = targets[plan.elementId];
  const defaultTime = intervals.includes(plan.anchorTime) ? plan.anchorTime : intervals[0] ?? plan.anchorTime;
  const target: MeasurementTarget = storedTarget && intervals.includes(storedTarget.time)
    ? storedTarget
    : { time: defaultTime, side: "TO" };
  const context = deriveFieldMeasurementContext(session, plan, target.time, target.side);
  const key = fieldMeasurementRecordKey(plan.elementId, target.time, target.side);
  const record = records[key] ?? null;
  const reconciliation = reconcileFieldMeasurement(context, record);

  const updateTarget = (patch: Partial<MeasurementTarget>) => {
    setTargets((current) => ({
      ...current,
      [plan.elementId]: { ...target, ...patch },
    }));
  };

  const updateRecord = (patch: Partial<Pick<FieldMeasurementRecord, "currentA" | "voltageKv" | "reference">>) => {
    setRecords((current) => {
      const existing = current[key] ?? {
        elementId: plan.elementId,
        time: target.time,
        side: target.side,
        currentA: null,
        voltageKv: null,
        reference: "",
      };
      return { ...current, [key]: { ...existing, ...patch } };
    });
  };

  return (
    <>
      <FieldMeasurementPanel
        plan={plan}
        intervals={intervals}
        context={context}
        record={record}
        reconciliation={reconciliation}
        onTimeChange={(time) => updateTarget({ time })}
        onSideChange={(side) => updateTarget({ side })}
        onRecordChange={updateRecord}
        onOpenDataset={openDatasetManager}
      />
      <FieldCorrectionWorkspace
        plan={plan}
        context={context}
        record={record}
        reconciliation={reconciliation}
      />
    </>
  );
}
