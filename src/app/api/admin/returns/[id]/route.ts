import { db } from "@/db";
import { requireStaff, staffDenied } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { decideReturn, OrderActionError, receiveReturn, refundReturn } from "@/lib/order-admin";
import { hasPermission } from "@/lib/staff";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: "approve" | "reject" | "receive" | "refund";
  note?: string;
  items?: { returnItemId: number; condition: string; disposition: string }[];
  includeShipping?: boolean;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const staff = await requireStaff("view");
    if (!staff) return staffDenied();
    const returnId = Number((await context.params).id);
    if (!Number.isInteger(returnId) || returnId <= 0) return Response.json({ error: "Invalid return id." }, { status: 400 });
    const body = (await request.json().catch(() => ({}))) as Body;
    const needs = body.action === "refund" ? "payments" : "orders";
    if (!hasPermission(staff, needs)) return staffDenied();
    const actor = { id: staff.id, email: staff.email };

    let message: string;
    let detail: Record<string, unknown> = {};
    switch (body.action) {
      case "approve":
      case "reject":
        await decideReturn(returnId, actor, body.action === "approve", String(body.note ?? ""));
        message = body.action === "approve" ? "Return approved — the buyer has the RMA number." : "Return rejected and the buyer notified.";
        detail = { note: body.note ?? null };
        break;
      case "receive":
        await receiveReturn(returnId, actor, Array.isArray(body.items) ? body.items : []);
        message = "Cartons received and stock recorded.";
        detail = { items: body.items };
        break;
      case "refund": {
        const result = await refundReturn(returnId, actor, Boolean(body.includeShipping));
        if (!result.ok) return Response.json({ error: `Refund failed: ${result.error}` }, { status: 502 });
        message = `${formatMoney(result.amount)} refunded (${result.method}).`;
        detail = { amount: result.amount, method: result.method, ref: result.ref, includeShipping: Boolean(body.includeShipping) };
        break;
      }
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    await recordAudit(db, { actor, action: `return.${body.action}`, entityType: "return", entityId: returnId, after: detail, request });
    return Response.json({ ok: true, message });
  } catch (error) {
    if (error instanceof OrderActionError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[admin-return]", error);
    return Response.json({ error: "Return update failed." }, { status: 500 });
  }
}
