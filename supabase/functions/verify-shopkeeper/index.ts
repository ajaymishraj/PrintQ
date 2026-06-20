/**
 * Supabase Edge Function: verify-shopkeeper
 *
 * Verifies shopkeeper login credentials server-side.
 * Deploy with: supabase functions deploy verify-shopkeeper
 *
 * Set secrets with:
 *   supabase secrets set SHOPKEEPER_EMAIL=admin@printq.local
 *   supabase secrets set SHOPKEEPER_PASS=admin_password
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
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: "Missing email or password" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const shopEmail = Deno.env.get("SHOPKEEPER_EMAIL") || "admin@printq.local";
    const shopPass  = Deno.env.get("SHOPKEEPER_PASS") || "shop123";

    if (email === shopEmail && password === shopPass) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Invalid shopkeeper credentials." }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
