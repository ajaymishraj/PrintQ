/**
 * PrintQ Configuration
 * ─────────────────────────────────────────────────────────
 * Fill in your credentials here to enable Supabase + PayU.
 * Until you do, the app runs in LOCAL DEMO MODE (no real DB or payments).
 *
 * HOW TO GET THESE VALUES: see README.md
 */
const PRINTQ_CONFIG = {

  // ── Supabase ─────────────────────────────────────────────
  supabaseUrl:     'https://fvcthhwngfbeskzpurcx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2Y3RoaHduZ2ZiZXNrenB1cmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjIxNzYsImV4cCI6MjA5NzQzODE3Nn0.1p5Dh0vmks4HAS8AXaeeJ_fgsXlXxFXYmlJ1BVDJweI',

  // URL of your Supabase Edge Functions. Computed dynamically using supabaseUrl.
  get createPayuHashUrl() {
    return this.supabaseUrl ? `${this.supabaseUrl}/functions/v1/create-payu-hash` : '';
  },
  get verifyShopkeeperUrl() {
    return this.supabaseUrl ? `${this.supabaseUrl}/functions/v1/verify-shopkeeper` : '';
  },

  // ── PayU Configuration ──────────────────────────────────
  // Set to true for test/sandbox mode, false for production
  payuTestMode: true,

  // ── Shop Info ────────────────────────────────────────────
  shopName:    'PrintQ - Campus Print Shop',
  shopAddress: 'Near Main Gate, Campus',
  currency:    'INR',
  queueLimit:  60,
  avgMinPerJob: 3,

  // ── Business Info (for policy pages — update with your real details) ──
  tradeName:      'PrintQ',
  legalName:      'PrintQ',
  registeredAddress: 'Mathura, Uttar Pradesh, India',
  contactEmail:   'support@printq.local',

  // ── Shopkeeper login (credentials verified via Edge Function) ─
  shopkeeperEmail: 'admin@printq.local',   // default login email

  // ── Pricing (Rs per page) ────────────────────────────────
  pricing: {
    bw:       2,    // Black & White per page
    color:    10,   // Colored per page
    a3Extra:  2,    // Extra cost per page for A3
    doubleDiscount: 0.90,  // 10% off for double-sided
    staple:   2,    // flat fee
    bind:     30,   // flat fee
  },
};

// ── Feature flags (auto-detected) ───────────────────────────
const HAS_SUPABASE = PRINTQ_CONFIG.supabaseUrl.startsWith('https://') &&
                     PRINTQ_CONFIG.supabaseAnonKey.length > 40;

const HAS_PAYU = HAS_SUPABASE;
