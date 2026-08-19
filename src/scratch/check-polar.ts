import dotenv from "dotenv";
dotenv.config();

async function testPolarCreateProduct() {
  const token = process.env.POLAR_ACCESS_TOKEN;

  // 1. Get Org ID
  const orgRes = await fetch("https://sandbox-api.polar.sh/v1/organizations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const orgs = await orgRes.json();
  const orgId = orgs.items?.[0]?.id;
  console.log("Org ID:", orgId);

  // 2. Test create product API schema
  const testPayload = {
    name: "Test Plan Schema Verification",
    description: "Temporary product schema test",
    organization_id: orgId,
    recurring_interval: "month",
    prices: [
      {
        amount_type: "fixed",
        price_amount: 9900,
        price_currency: "inr",
        type: "recurring",
        recurring_interval: "month",
      },
    ],
    metadata: {
      code: "test_verification_code",
    },
  };

  const createRes = await fetch("https://sandbox-api.polar.sh/v1/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(testPayload),
  });

  console.log("Create product status:", createRes.status);
  const result = await createRes.json();
  console.log("Create product response:", JSON.stringify(result, null, 2));

  // If created, archive / delete test product
  if (createRes.status === 201 || createRes.status === 200) {
    const productId = result.id;
    console.log("Created Product ID:", productId);
    console.log("Prices in response:", result.prices);

    // Archive test product
    const updateRes = await fetch(`https://sandbox-api.polar.sh/v1/products/${productId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_archived: true }),
    });
    console.log("Archive status:", updateRes.status);
  }
}

testPolarCreateProduct().catch(console.error);
