type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

type GroomingStatus =
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "READY_FOR_PICKUP"
  | "PICKED_UP";

const cancelableStatuses = new Set<AppointmentStatus>(["PENDING", "CONFIRMED"]);
const confirmableStatuses = new Set<AppointmentStatus>(["PENDING", "CONFIRMED"]);
const noShowStatuses = new Set<AppointmentStatus>(["PENDING", "CONFIRMED"]);

const groomingTransitions: Record<
  GroomingStatus,
  Array<GroomingStatus | null>
> = {
  CHECKED_IN: [null, "CHECKED_IN"],
  IN_PROGRESS: ["CHECKED_IN", "IN_PROGRESS"],
  READY_FOR_PICKUP: ["CHECKED_IN", "IN_PROGRESS", "READY_FOR_PICKUP"],
  PICKED_UP: ["READY_FOR_PICKUP", "PICKED_UP"],
};

export function canConfirmAppointment(status: AppointmentStatus) {
  return confirmableStatuses.has(status);
}

export function canCancelAppointment(status: AppointmentStatus) {
  return cancelableStatuses.has(status);
}

export function canMarkAppointmentNoShow(status: AppointmentStatus) {
  return noShowStatuses.has(status);
}

export function canApplyGroomingStatus(params: {
  appointmentStatus: AppointmentStatus;
  currentGroomingStatus: GroomingStatus | null;
  nextGroomingStatus: GroomingStatus;
}) {
  if (!confirmableStatuses.has(params.appointmentStatus)) {
    return false;
  }

  return groomingTransitions[params.nextGroomingStatus].includes(
    params.currentGroomingStatus
  );
}
