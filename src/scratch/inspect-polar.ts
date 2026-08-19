import dotenv from "dotenv";
dotenv.config();

async function inspectPolarAPI() {
  const token = process.env.POLAR_ACCESS_TOKEN;
  const serverUrl = process.env.POLAR_SERVER_URL || "https://sandbox-api.polar.sh";

  const prodRes = await fetch(`${serverUrl}/v1/products?is_archived=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prodData = await prodRes.json();
  const items = prodData.items || (Array.isArray(prodData) ? prodData : []);
  const priceId = items[0]?.prices?.[0]?.id;
  console.log("Found priceId:", priceId);

  // Test POST /v1/checkouts/ with product_price_id and clean metadata
  const payload: any = {
    product_price_id: priceId,
    customer_email: "test.candidate@example.com",
    customer_name: "Test Candidate",
    success_url: "https://example.com/success?checkout_id={CHECKOUT_ID}",
    metadata: {
      userId: "user_test_123",
      planCode: "candidate_pro",
    },
  };

  console.log("\nSending payload to POST /v1/checkouts/:", JSON.stringify(payload, null, 2));

  const checkoutRes = await fetch(`${serverUrl}/v1/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  console.log("POST /v1/checkouts/ status:", checkoutRes.status);
  const checkoutData = await checkoutRes.json();
  console.log("POST /v1/checkouts/ response:", JSON.stringify(checkoutData, null, 2));

  if (checkoutData.id) {
    console.log("\nFetching created checkout GET /v1/checkouts/" + checkoutData.id);
    const getRes = await fetch(`${serverUrl}/v1/checkouts/${checkoutData.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("GET /v1/checkouts/{id} status:", getRes.status);
    const getBody = await getRes.json();
    console.log("GET /v1/checkouts/{id} response status:", getBody.status);

    const { verifyPolarWebhookSignature } = await import("../services/polar.service");
    const testSig = verifyPolarWebhookSignature(JSON.stringify({ event: "checkout.created" }), "v1,sample_signature_123");
    console.log("✓ verifyPolarWebhookSignature test output:", testSig);
  }
}

inspectPolarAPI().catch(console.error);
