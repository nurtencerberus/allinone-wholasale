import { db } from "@/db";
import { wholesaleApplications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";

const REQUIRED = [
  "companyName",
  "ein",
  "businessType",
  "contactName",
  "email",
  "phone",
  "addressLine1",
  "city",
  "state",
  "zip",
  "annualVolume",
  "categories",
] as const;

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = (await request.json()) as Record<string, string>;
    for (const field of REQUIRED) {
      if (!String(body[field] ?? "").trim()) {
        return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    const ein = String(body.ein).replace(/\s/g, "");
    if (!/^\d{2}-?\d{7}$/.test(ein)) {
      return Response.json(
        { error: "EIN must match the format 12-3456789." },
        { status: 400 },
      );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(body.email))) {
      return Response.json({ error: "Enter a valid business email address." }, { status: 400 });
    }
    if (!/^\d{5}$/.test(String(body.zip).trim())) {
      return Response.json({ error: "Enter a 5-digit ZIP code." }, { status: 400 });
    }

    const session = await getSessionUser();

    const [application] = await db
      .insert(wholesaleApplications)
      .values({
        userId: session?.id ?? null,
        companyName: String(body.companyName).trim(),
        ein: ein.includes("-") ? ein : `${ein.slice(0, 2)}-${ein.slice(2)}`,
        businessType: String(body.businessType).trim(),
        contactName: String(body.contactName).trim(),
        email: String(body.email).trim().toLowerCase(),
        phone: String(body.phone).trim(),
        website: String(body.website ?? "").trim() || null,
        addressLine1: String(body.addressLine1).trim(),
        city: String(body.city).trim(),
        state: String(body.state).trim().toUpperCase().slice(0, 2),
        zip: String(body.zip).trim(),
        annualVolume: String(body.annualVolume).trim(),
        categories: String(body.categories).trim(),
        notes: String(body.notes ?? "").trim() || null,
        status: "pending",
      })
      .returning({ id: wholesaleApplications.id });

    return Response.json({
      ok: true,
      applicationId: application?.id,
      message:
        "Application received. A Newark trade specialist will verify your EIN and confirm resale documentation within one business day.",
    });
  } catch (error) {
    console.error("[wholesale-apply]", error);
    return Response.json({ error: "Could not submit the application." }, { status: 500 });
  }
}
