// REALCHECK — Sumsub Sandbox applicant + WebSDK token
// Deploy as: supabase/functions/sumsub-create-applicant/index.ts
// Required Edge Function secrets:
// SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_LEVEL_NAME
// Supabase provides SUPABASE_URL and SUPABASE_ANON_KEY automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://arthur1915-afk.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sumsubRequest(
  method: string,
  path: string,
  bodyText: string,
  appToken: string,
  secretKey: string,
) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = ts + method.toUpperCase() + path + bodyText;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return fetch("https://api.sumsub.com" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": appToken,
      "X-App-Access-Ts": ts,
      "X-App-Access-Sig": signature,
    },
    body: bodyText || undefined,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const appToken = Deno.env.get("SUMSUB_APP_TOKEN");
    const secretKey = Deno.env.get("SUMSUB_SECRET_KEY");
    const levelName = Deno.env.get("SUMSUB_LEVEL_NAME");

    if (!supabaseUrl || !supabaseAnonKey || !appToken || !secretKey || !levelName) {
      return json({ error: "Backend configuration is incomplete. Check Supabase function secrets." }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

    const externalUserId = user.id;
    const applicantPath = "/resources/applicants?levelName=" + encodeURIComponent(levelName);
    const applicantBody = JSON.stringify({ externalUserId });
    let applicantResponse = await sumsubRequest("POST", applicantPath, applicantBody, appToken, secretKey);
    let applicantData = await applicantResponse.json().catch(() => ({}));

    // If the applicant already exists for this external user, find it instead of creating a duplicate.
    if (!applicantResponse.ok && applicantResponse.status === 409) {
      const lookupPath = "/resources/applicants/-;externalUserId=" + encodeURIComponent(externalUserId) + "/one";
      const lookupResponse = await sumsubRequest("GET", lookupPath, "", appToken, secretKey);
      applicantData = await lookupResponse.json().catch(() => ({}));
      if (!lookupResponse.ok) {
        return json({ error: "Could not retrieve the existing verification applicant." }, 502);
      }
    } else if (!applicantResponse.ok) {
      return json({ error: "Sumsub could not create the verification applicant.", providerStatus: applicantResponse.status }, 502);
    }

    const applicantId = applicantData.id;
    if (!applicantId) return json({ error: "Sumsub did not return an applicant ID." }, 502);

    const tokenPath = "/resources/accessTokens/sdk";
    const tokenBody = JSON.stringify({ userId: externalUserId, levelName, ttlInSecs: 600 });
    const tokenResponse = await sumsubRequest("POST", tokenPath, tokenBody, appToken, secretKey);
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.token) {
      return json({ error: "Sumsub could not issue a WebSDK access token.", providerStatus: tokenResponse.status }, 502);
    }

    return json({
      applicantId,
      accessToken: tokenData.token,
      expiresIn: 600,
      environment: "sandbox",
    });
  } catch (_error) {
    return json({ error: "Unexpected verification setup error." }, 500);
  }
});
