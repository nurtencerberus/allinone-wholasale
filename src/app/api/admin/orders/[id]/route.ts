import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/site";
import { escapeHtml, sendEmail } from "@/lib/email";

function trackingUrlFor(carrier: string, trackingNumber: string): string | null {
  if (!trackingNumber) return null;
  const normalized = carrier.toLowerCase();
  if (normalized.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`;
  }
  if (normalized.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
  }
  if (normalized.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`;
  }
  return null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId)) {
      return Response.json({ error: "Invalid order id." }, { status: 400 });
    }

    const body = (await request.json()) as {
      status?: string;
      trackingNumber?: string;
      carrier?: string;
      note?: string;
      markPaid?: boolean;
    };

    const [existing] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!existing) return Response.json({ error: "Order not found." }, { status: 404 });

    // Funds received for an ACH/wire order or a Net-30 invoice. No other payment transitions.
    let paymentStatus = existing.paymentStatus;
    if (body.markPaid === true) {
      if (existing.paymentStatus !== "awaiting_payment" && existing.paymentStatus !== "net30_invoice") {
        return Response.json({ error: "This order has no outstanding balance to mark as paid." }, { status: 409 });
      }
      paymentStatus = "paid";
    }

    const status = body.status && ORDER_STATUSES.includes(body.status as (typeof ORDER_STATUSES)[number])
      ? body.status
      : existing.status;
    const carrier = (body.carrier ?? existing.shippingCarrier).trim();
    const trackingNumber = (body.trackingNumber ?? existing.trackingNumber ?? "").trim() || null;

    await db
      .update(orders)
      .set({
        status,
        paymentStatus,
        shippingCarrier: carrier,
        trackingNumber,
        trackingUrl: trackingNumber ? trackingUrlFor(carrier, trackingNumber) : null,
        notes: body.note?.trim() ? body.note.trim() : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    if (trackingNumber && trackingNumber !== existing.trackingNumber) {
      await sendEmail({
        to: existing.email,
        subject: `Order ${existing.orderNumber} has shipped`,
        html: `<p>Hi ${escapeHtml(existing.customerName.split(" ")[0])},</p><p>Order <strong>${existing.orderNumber}</strong> is on the way with ${escapeHtml(carrier)}. Tracking number: <strong>${escapeHtml(trackingNumber)}</strong>.</p><p>— Meridian Supply Co. trade desk</p>`,
      });
    }

    return Response.json({ ok: true, status, trackingNumber, carrier });
  } catch (error) {
    console.error("[admin-order]", error);
    return Response.json({ error: "Order update failed." }, { status: 500 });
  }
}
