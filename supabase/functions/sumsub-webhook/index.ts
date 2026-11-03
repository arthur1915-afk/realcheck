import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyDigest(raw: Uint8Array, secret: string, digest: string, algorithm: string) {
  const algorithms: Record<string, string> = {
    HMAC_SHA256_HEX: "SHA-256",
    HMAC_SHA512_HEX: "SHA-512",
    HMAC_SHA1_HEX: "SHA-1",
  };
  const name = algorithms[algorithm];
  if (!name || !digest) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: name },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, raw);
  return constantTimeEqual(hex(new Uint8Array(signature)), digest.toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const secret = Deno.env.get("SUMSUB_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || !supabaseUrl || !serviceRoleKey) {
      console.error("Missing webhook environment configuration");
      return new Response("Server configuration error", { status: 500 });
    }

    const raw = new Uint8Array(await req.arrayBuffer());
    const digest = req.headers.get("x-payload-digest") ?? "";
    const algorithm = req.headers.get("x-payload-digest-alg") ?? "HMAC_SHA256_HEX";
    if (!await verifyDigest(raw, secret, digest, algorithm)) {
      return new Response("Invalid webhook signature", { status: 401 });
    }

    const event = JSON.parse(new TextDecoder().decode(raw));
    if (event.type !== "applicantReviewed") {
      return Response.json({ received: true, ignored: true });
    }

    const userId = String(event.externalUserId ?? "");
    const applicantId = String(event.applicantId ?? "");
    const answer = String(event.reviewResult?.reviewAnswer ?? "");
    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);

    if (!validUuid || !applicantId || !["GREEN", "RED"].includes(answer)) {
      return new Response("Invalid applicant review payload", { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const record = {
      user_id: userId,
      provider: "sumsub",
      provider_reference: applicantId,
      status: answer === "GREEN" ? "verified" : "rejected",
      verified_at: answer === "GREEN" ? new Date().toISOString() : null,
    };

    const { data: existing, error: findError } = await admin
      .from("identity_verifications")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "sumsub")
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error("Could not find verification record", findError.message);
      return new Response("Database lookup failed", { status: 500 });
    }

    const write = existing
      ? await admin.from("identity_verifications").update(record).eq("id", existing.id)
      : await admin.from("identity_verifications").insert(record);

    if (write.error) {
      console.error("Could not save verification result", write.error.message);
      return new Response("Database update failed", { status: 500 });
    }

    return Response.json({ received: true, status: record.status });
  } catch (error) {
    console.error("Webhook processing error", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
