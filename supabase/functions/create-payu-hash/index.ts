/**
 * Supabase Edge Function: create-payu-hash
 *
 * Generates the SHA-512 hash required by PayU for payment initiation.
 * The salt is never exposed to the browser — only the computed hash is returned.
 *
 * Deploy with: supabase functions deploy create-payu-hash
 *
 * Set secrets with:
 *   supabase secrets set PAYU_KEY=your_payu_merchant_key
 *   supabase secrets set PAYU_SALT=your_payu_salt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Compute SHA-512 hex digest of a string.
 */
async function sha512(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  const hashArray = new Uint8Array(hashBuffer);
  return new TextDecoder().decode(hexEncode(hashArray));
}

serve(async (req) => {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { txnid, amount, productinfo, firstname, email, phone } = await req.json();

    // Validate required fields
    if (!txnid || !amount || !productinfo || !firstname || !email) {
      return new Response(JSON.stringify({ error: "Missing required fields (txnid, amount, productinfo, firstname, email)" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const key  = Deno.env.get("PAYU_KEY") ?? "";
    const salt = Deno.env.get("PAYU_SALT") ?? "";

    if (!key || !salt) {
      return new Response(JSON.stringify({
        error: "PayU credentials not configured",
        keySet: !!key,
        saltSet: !!salt,
      }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // PayU hash formula:
    // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
    const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
    const hash = await sha512(hashString);

    console.log(`[PayU] Generated hash for txnid=${txnid}, amount=${amount}, key=${key}`);

    // Determine PayU base URL (test vs production)
    // Test: https://test.payu.in/_payment
    // Prod: https://secure.payu.in/_payment
    // For now we return the key and hash; the frontend decides the URL based on config
    const surl = `${req.headers.get("origin") || "*"}/`;
    const furl = `${req.headers.get("origin") || "*"}/`;

    return new Response(JSON.stringify({
      key,
      txnid,
      hash,
      amount: String(amount),
      productinfo,
      firstname,
      email,
      phone: phone || "",
      surl,
      furl,
    }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
