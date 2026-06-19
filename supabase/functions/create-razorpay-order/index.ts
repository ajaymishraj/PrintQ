/**
 * Supabase Edge Function: create-razorpay-order
 *
 * Creates a Razorpay order server-side (key_secret never exposed to browser).
 * Deploy with: supabase functions deploy create-razorpay-order
 *
 * Set secrets with:
 *   supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx
 *   supabase secrets set RAZORPAY_KEY_SECRET=your_secret_here
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { amount, receipt, notes } = await req.json();

    if (!amount || amount < 100) {
      return new Response(JSON.stringify({ error: "Invalid amount (min Rs 1)" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const keyId     = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

    // Debug: return early if secrets are missing
    if (!keyId || !keySecret) {
      return new Response(JSON.stringify({
        error: "Missing secrets",
        keyIdSet: !!keyId,
        keySecretSet: !!keySecret,
      }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Debug: log which key ID is being used (safe — not the secret)
    console.log("Using Razorpay Key ID:", keyId, "| Key length:", keySecret.length);

    const credentials = btoa(`${keyId}:${keySecret}`);

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Basic ${credentials}`,
      },
      body: JSON.stringify({
        amount:   Math.round(amount),   // in paise
        currency: "INR",
        receipt:  receipt || "receipt_" + Date.now(),
        notes:    notes || {},
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: err }), {
        status: response.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const order = await response.json();
    return new Response(JSON.stringify({
      ...order,
      razorpayKeyId: keyId,
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
