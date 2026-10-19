import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { wholesaleApplications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

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

/** EIN prefixes the IRS has never assigned (format check only; the admin verifies against IRS records). */
const INVALID_EIN_PREFIXES = new Set(["00", "07", "08", "09", "17", "18", "19", "28", "29", "49", "69", "70", "78", "79", "89", "96", "97"]);

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    // An application is tied to a signed-in account whose e-mail is already confirmed, so
    // approving it can never grant trade pricing to an address nobody proved they own.
    const session = await getSessionUser();
    if (!session) {
      return Response.json({ error: "Sign in or create an account before applying." }, { status: 401 });
    }
    if (!session.emailVerified) {
      return Response.json({ error: "Confirm your email address before applying." }, { status: 403 });
    }
    if (session.accountTier === "wholesale") {
      return Response.json({ error: "This account is already approved for wholesale." }, { status: 409 });
    }
    const [open] = await db
      .select({ id: wholesaleApplications.id })
      .from(wholesaleApplications)
      .where(and(eq(wholesaleApplications.userId, session.id), inArray(wholesaleApplications.status, ["pending"])))
      .limit(1);
    if (open) {
      return Response.json({ error: "Your application is already under review." }, { status: 409 });
    }
    const limit = await consumeRateLimit("wholesale-apply", clientIp(request), 5, 3600);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = (await request.json()) as Record<string, string>;
    body.email = session.email;
    for (const field of REQUIRED) {
      if (!String(body[field] ?? "").trim()) {
        return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    const ein = String(body.ein).replace(/\s/g, "");
    if (!/^\d{2}-?\d{7}$/.test(ein) || INVALID_EIN_PREFIXES.has(ein.slice(0, 2))) {
      return Response.json(
        { error: "EIN must match the format 12-3456789." },
        { status: 400 },
      );
    }
    if (!/^\d{5}$/.test(String(body.zip).trim())) {
      return Response.json({ error: "Enter a 5-digit ZIP code." }, { status: 400 });
    }

    const [application] = await db
      .insert(wholesaleApplications)
      .values({
        userId: session.id,
        companyName: String(body.companyName).trim(),
        ein: ein.includes("-") ? ein : `${ein.slice(0, 2)}-${ein.slice(2)}`,
        businessType: String(body.businessType).trim(),
        contactName: String(body.contactName).trim(),
        email: session.email,
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
        "Application received. A trade specialist will verify your EIN and confirm resale documentation within one business day.",
    });
  } catch (error) {
    console.error("[wholesale-apply]", error);
    return Response.json({ error: "Could not submit the application." }, { status: 500 });
  }
}
