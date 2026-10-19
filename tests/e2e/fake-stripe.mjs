// Minimal fake of the Stripe PaymentIntents API for local tests.
import http from "node:http";

const intents = new Map();
const calls = [];
const idem = new Map();
let failNextCapture = false;
let n = 0;

function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json", "request-id": `req_${++n}` });
      res.end(JSON.stringify(json));
    };
    const url = new URL(req.url, "http://x");
    // Test control endpoints
    if (url.pathname === "/_control/state") return send(200, { intents: [...intents.values()], calls });
    if (url.pathname === "/_control/set") {
      const { id, status } = JSON.parse(body);
      intents.get(id).status = status;
      if (status === "requires_capture") intents.get(id).amount_capturable = intents.get(id).amount;
      return send(200, intents.get(id));
    }
    if (url.pathname === "/_control/failNextCapture") { failNextCapture = true; return send(200, {}); }
    if (url.pathname === "/_control/reset") { intents.clear(); calls.length = 0; idem.clear(); return send(200, {}); }

    const key = req.headers["idempotency-key"];
    const m = url.pathname.match(/^\/v1\/payment_intents(?:\/([^/]+))?(?:\/(capture|cancel))?$/);
    if (!m) return send(404, { error: { message: "not found" } });
    const [, id, action] = m;
    calls.push({ method: req.method, path: url.pathname, idempotencyKey: key });
    if (key && idem.has(key)) return send(200, intents.get(idem.get(key)));

    if (req.method === "POST" && !id) {
      const p = parseForm(body);
      const pi = {
        id: `pi_test_${++n}`, object: "payment_intent", amount: Number(p.amount), currency: p.currency,
        capture_method: p.capture_method, status: "requires_payment_method", client_secret: `pi_secret_${n}`,
        metadata: {}, amount_capturable: 0,
      };
      intents.set(pi.id, pi);
      if (key) idem.set(key, pi.id);
      return send(200, pi);
    }
    const pi = intents.get(id);
    if (!pi) return send(404, { error: { type: "invalid_request_error", message: "No such payment_intent" } });
    if (req.method === "GET") return send(200, pi);
    if (action === "capture") {
      if (failNextCapture) { failNextCapture = false; return send(402, { error: { type: "card_error", message: "Your card was declined." } }); }
      if (pi.status !== "requires_capture") return send(400, { error: { type: "invalid_request_error", message: "not capturable" } });
      pi.status = "succeeded"; pi.amount_received = pi.amount;
      if (key) idem.set(key, pi.id);
      return send(200, pi);
    }
    if (action === "cancel") {
      pi.status = "canceled";
      if (key) idem.set(key, pi.id);
      return send(200, pi);
    }
    return send(400, { error: { message: "unsupported" } });
  });
});
server.listen(12111, "127.0.0.1", () => console.log("fake stripe on 12111"));
