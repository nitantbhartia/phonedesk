import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizePhoneNumber(value) {
  if (!value) return null;

  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (value.startsWith("+")) {
    return value;
  }

  return digits ? `+${digits}` : null;
}

async function main() {
  const businesses = await prisma.business.findMany({
    select: { id: true, phone: true },
  });

  let updatedBusinesses = 0;
  for (const business of businesses) {
    const normalizedPhone = normalizePhoneNumber(business.phone);
    if (normalizedPhone && normalizedPhone !== business.phone) {
      await prisma.business.update({
        where: { id: business.id },
        data: { phone: normalizedPhone },
      });
      updatedBusinesses += 1;
    }
  }

  const appointments = await prisma.appointment.findMany({
    select: { id: true, customerPhone: true },
  });

  let updatedAppointments = 0;
  for (const appointment of appointments) {
    const normalizedPhone = normalizePhoneNumber(appointment.customerPhone);
    if (normalizedPhone && normalizedPhone !== appointment.customerPhone) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { customerPhone: normalizedPhone },
      });
      updatedAppointments += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        updatedBusinesses,
        updatedAppointments,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
