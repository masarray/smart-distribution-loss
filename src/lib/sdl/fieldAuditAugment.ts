import type { FieldCorrectionAuditTrail } from "./fieldAudit";

declare module "./fieldOperational" {
  interface FieldOperationalSession {
    auditTrail?: FieldCorrectionAuditTrail;
  }
}

export {};
