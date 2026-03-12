import type { BookingMode } from "@prisma/client";
import { buildAgentTools, generateSystemPrompt } from "./retell";

type RetellEvalCase = {
  id: string;
  description: string;
  run: (input: {
    hardPrompt: string;
    softPrompt: string;
    tools: ReturnType<typeof buildAgentTools>;
  }) => boolean;
};

export type RetellEvalResult = {
  id: string;
  description: string;
  passed: boolean;
};

function makeBusiness(bookingMode: BookingMode) {
  return {
    id: `biz_${bookingMode.toLowerCase()}`,
    name: bookingMode === "HARD" ? "Clip Joint" : "Bath Club",
    ownerName: bookingMode === "HARD" ? "Morgan" : "Jordan",
    address: "123 Main St",
    city: "San Diego",
    bookingMode,
    businessHours: { mon: { open: "09:00", close: "17:00" } },
    services: [
      {
        id: "svc_1",
        businessId: `biz_${bookingMode.toLowerCase()}`,
        name: "Full Groom",
        price: 95,
        duration: 90,
        isActive: true,
        isAddon: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "svc_2",
        businessId: `biz_${bookingMode.toLowerCase()}`,
        name: "Teeth Brushing",
        price: 20,
        duration: 10,
        isActive: true,
        isAddon: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    breedRecommendations: [],
    groomers: [],
  } as const;
}

const evalCases: RetellEvalCase[] = [
  {
    id: "availability_service_id",
    description: "Availability tool requires the exact service_id from get_services",
    run: ({ tools }) => {
      const tool = tools.find((entry) => entry.name === "check_availability");
      return Boolean(
        tool?.parameters?.required?.includes("service_id") &&
          tool.parameters.properties.service_id.description.includes("exact service_id")
      );
    },
  },
  {
    id: "booking_service_id",
    description: "Booking tool requires the exact service_id from get_services",
    run: ({ tools }) => {
      const tool = tools.find((entry) => entry.name === "book_appointment");
      return Boolean(
        tool?.parameters?.required?.includes("service_id") &&
          tool.parameters.properties.service_id.description.includes("exact service_id")
      );
    },
  },
  {
    id: "cancel_no_context_fallback",
    description: "Prompt allows cancel tool fallback when the caller gives no identifying details",
    run: ({ hardPrompt }) =>
      hardPrompt.includes(
        "If you do not have enough detail to ask a useful clarifying question yet, call cancel_appointment"
      ),
  },
  {
    id: "status_today_only",
    description: "Prompt keeps status checks scoped to today's live updates",
    run: ({ hardPrompt }) =>
      hardPrompt.includes(
        "Do not switch to a future appointment unless the caller specifically asks about a future booking."
      ),
  },
  {
    id: "soft_booking_honesty",
    description: "Soft-booking disclosure does not promise an instantly confirmed booking",
    run: ({ softPrompt }) =>
      softPrompt.includes("confirm it with you") &&
      !softPrompt.includes("fully booked right now"),
  },
];

export function runRetellPolicyEvals(appUrl: string): RetellEvalResult[] {
  const hardPrompt = generateSystemPrompt(makeBusiness("HARD") as never);
  const softPrompt = generateSystemPrompt(makeBusiness("SOFT") as never);
  const tools = buildAgentTools(appUrl);

  return evalCases.map((evalCase) => ({
    id: evalCase.id,
    description: evalCase.description,
    passed: evalCase.run({ hardPrompt, softPrompt, tools }),
  }));
}
