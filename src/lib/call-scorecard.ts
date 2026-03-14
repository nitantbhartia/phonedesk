type ExtractedData = Record<string, unknown> | null | undefined;

export interface CallScorecardInput {
  callerName?: string | null;
  status?: string | null;
  summary?: string | null;
  appointment?: {
    petName?: string | null;
    serviceName?: string | null;
  } | null;
  extractedData?: ExtractedData;
}

export interface CallScoreCriterion {
  key: string;
  label: string;
  passed: boolean;
  points: number;
  detail?: string;
}

export interface CallScorecardResult {
  total: number;
  max: number;
  criteria: CallScoreCriterion[];
  label: "Excellent" | "Healthy" | "Needs work";
}

export interface NormalizedCallExtraction {
  customerName: string | null;
  petName: string | null;
  breed: string | null;
  size: string | null;
  service: string | null;
  outcome: string | null;
  notes: string | null;
}

function getStringValue(
  data: ExtractedData,
  keys: string[]
): string | null {
  if (!data) return null;

  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function normalizeCallExtraction(
  data: ExtractedData
): NormalizedCallExtraction {
  return {
    customerName: getStringValue(data, [
      "customerName",
      "customer_name",
      "callerName",
      "caller_name",
      "name",
    ]),
    petName: getStringValue(data, [
      "petName",
      "pet_name",
      "dogName",
      "dog_name",
    ]),
    breed: getStringValue(data, [
      "petBreed",
      "pet_breed",
      "dogBreed",
      "dog_breed",
      "breed",
    ]),
    size: getStringValue(data, [
      "petSize",
      "pet_size",
      "dogSize",
      "dog_size",
      "size",
    ]),
    service: getStringValue(data, [
      "serviceName",
      "service_name",
      "requestedService",
      "requested_service",
      "service",
    ]),
    outcome: getStringValue(data, [
      "outcome",
      "callOutcome",
      "call_outcome",
      "bookingOutcome",
      "booking_outcome",
    ]),
    notes: getStringValue(data, [
      "notes",
      "specialNotes",
      "special_notes",
      "specialHandlingNotes",
      "special_handling_notes",
    ]),
  };
}

export function computeCallScorecard(
  call: CallScorecardInput
): CallScorecardResult {
  const extracted = normalizeCallExtraction(call.extractedData);
  const hasAppointment = Boolean(call.appointment);
  const hasCustomerName = Boolean(extracted.customerName || call.callerName);
  const hasPetName = Boolean(extracted.petName || call.appointment?.petName);
  const hasPetDetails = Boolean(extracted.breed || extracted.size);
  const hasService = Boolean(extracted.service || call.appointment?.serviceName);
  const hasSummary = Boolean(call.summary?.trim());

  let outcomePoints = 0;
  let outcomeLabel = "Outcome captured";
  let outcomeDetail: string | undefined;

  if (hasAppointment) {
    outcomePoints = 2;
    outcomeLabel = "Booking completed";
    outcomeDetail = "Appointment record attached";
  } else if (call.status === "NO_BOOKING" || extracted.outcome) {
    outcomePoints = 1;
    outcomeLabel = "Outcome captured";
    outcomeDetail = extracted.outcome ?? "No-booking outcome recorded";
  } else if (call.status === "COMPLETED" && hasSummary) {
    outcomePoints = 1;
    outcomeLabel = "Outcome inferred";
    outcomeDetail = "Summary explains the result";
  }

  const criteria: CallScoreCriterion[] = [
    { key: "customer", label: "Customer identified", passed: hasCustomerName, points: 1 },
    { key: "pet", label: "Pet identified", passed: hasPetName, points: 1 },
    { key: "petDetails", label: "Pet details captured", passed: hasPetDetails, points: 1 },
    { key: "service", label: "Service captured", passed: hasService, points: 1 },
    {
      key: "outcome",
      label: outcomeLabel,
      passed: outcomePoints > 0,
      points: outcomePoints,
      detail: outcomeDetail,
    },
    { key: "summary", label: "Summary written", passed: hasSummary, points: 1 },
  ];

  const total = criteria.reduce((sum, criterion) => {
    return sum + (criterion.passed ? criterion.points : 0);
  }, 0);
  const max = 7;
  const label =
    total >= 6 ? "Excellent" : total >= 4 ? "Healthy" : "Needs work";

  return { total, max, criteria, label };
}
