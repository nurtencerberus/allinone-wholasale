import { db } from "@/db";
import { requireStaff, staffDenied } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  addAdminNote,
  cancelOrder,
  changeOrderStatus,
  markPaid,
  OrderActionError,
  recordBankRefund,
  retryCancellationRefund,
  updateTracking,
} from "@/lib/order-admin";
import { hasPermission, type Permission } from "@/lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: "status" | "tracking" | "note" | "markPaid" | "cancel" | "retryRefund" | "bankRefund";
  status?: string;
  carrier?: string;
  trackingNumber?: string;
  note?: string;
  reason?: string;
  reference?: string;
};

const PERMISSION: Record<NonNullable<Body["action"]>, Permission> = {
  status: "orders",
  tracking: "orders",
  note: "orders",
  markPaid: "payments",
  cancel: "payments",
  retryRefund: "payments",
  bankRefund: "payments",
};

/** One action per request; the order's allowed transitions live in src/lib/order-admin.ts. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const staff = await requireStaff("view");
    if (!staff) return staffDenied();

    const orderId = Number((await context.params).id);
    if (!Number.isInteger(orderId) || orderId <= 0) return Response.json({ error: "Invalid order id." }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as Body;
    const action = body.action;
    if (!action || !(action in PERMISSION)) return Response.json({ error: "Unknown action." }, { status: 400 });
    if (!hasPermission(staff, PERMISSION[action])) return staffDenied();
    const actor = { id: staff.id, email: staff.email };

    let message = "Saved.";
    let detail: Record<string, unknown> = {};
    switch (action) {
      case "status": {
        const order = await changeOrderStatus(orderId, String(body.status ?? ""), actor, {
          carrier: body.carrier,
          trackingNumber: body.trackingNumber,
        });
        message = `Order ${order.orderNumber} is now ${order.status}.`;
        detail = { status: order.status, trackingNumber: order.trackingNumber };
        break;
      }
      case "tracking":
        await updateTracking(orderId, actor, String(body.carrier ?? ""), String(body.trackingNumber ?? ""));
        message = "Tracking updated.";
        detail = { carrier: body.carrier, trackingNumber: body.trackingNumber };
        break;
      case "note":
        await addAdminNote(orderId, actor, String(body.note ?? ""));
        message = "Note added.";
        break;
      case "markPaid":
        await markPaid(orderId, actor, body.reference ?? null);
        message = "Payment recorded.";
        detail = { reference: body.reference ?? null };
        break;
      case "cancel": {
        const result = await cancelOrder(orderId, actor, String(body.reason ?? ""));
        message = result.refund && !result.refund.ok
          ? `Order cancelled and stock returned, but the refund failed: ${result.refund.error} Use “Retry refund”.`
          : "Order cancelled, stock returned to its lots and payment released.";
        detail = { reason: body.reason ?? null, refund: result.refund };
        break;
      }
      case "retryRefund": {
        const refund = await retryCancellationRefund(orderId, actor);
        if (!refund.ok) return Response.json({ error: `Refund failed again: ${refund.error}` }, { status: 502 });
        message = "Refund sent.";
        detail = { refund };
        break;
      }
      case "bankRefund":
        await recordBankRefund(orderId, actor, String(body.reference ?? ""));
        message = "Bank refund recorded.";
        detail = { reference: body.reference ?? null };
        break;
    }

    await recordAudit(db, { actor, action: `order.${action}`, entityType: "order", entityId: orderId, after: detail, request });
    return Response.json({ ok: true, message });
  } catch (error) {
    if (error instanceof OrderActionError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[admin-order]", error);
    return Response.json({ error: "Order update failed." }, { status: 500 });
  }
}
