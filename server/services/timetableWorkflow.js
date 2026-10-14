const NOTE_REQUIRED_TRANSITIONS = new Set([
  "SUBMITTED->DRAFT",
  "SUBMITTED->APPROVED",
  "APPROVED->SUBMITTED",
  "APPROVED->PUBLISHED",
  "PUBLISHED->DRAFT",
  "LOCKED->PUBLISHED"
]);

export function workflowNoteRequired(current, next) {
  return NOTE_REQUIRED_TRANSITIONS.has(`${String(current || "").toUpperCase()}->${String(next || "").toUpperCase()}`);
}
