export async function GET() {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
  const secretConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return Response.json({
    mode: secretConfigured && publishableKey ? "stripe" : "demo",
    publishableKey,
    taxProvider: process.env.TAXJAR_API_KEY ? "taxjar" : "nexus_table",
    shippingProvider: process.env.EASYPOST_API_KEY ? "easypost" : "dimensional_matrix",
  });
}
