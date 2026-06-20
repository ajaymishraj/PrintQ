# PrintQ — Smart Campus Print Queue

PrintQ is a web-based, real-time print queue management system designed for campus printing shops. It allows students to submit documents, customize print preferences (B&W/Colored, Single/Double-sided, Staple/Bind), pay online via **PayU**, and get a digital ticket with live queue tracking. Shopkeepers get a dynamic dashboard to manage printing progress, view student instructions, download files, and send status updates.

---

## Key Features

- **Dual-Role Interface**: Separate customized views for **Students** (job submission, pricing estimate, live ticket tracker) and **Shopkeepers** (active queue, job stats, search history, progress updates).
- **Online Payments**: Fully integrated server-side PayU hash generation and PayU Bolt checkout for secure payment processing.
- **Secure Credentials**: Admin passwords and PayU API salt/key are stored safely as encrypted server-side Supabase environment secrets.
- **File Management**: Direct-to-storage document uploading with built-in client/server retention cleanup (automatically purges files older than 48 hours to save storage).
- **Offline / Local Demo Fallback**: Automatically falls back to local storage and payment simulation if Supabase is not configured, making development and demonstration easy.

---

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3 (Liquid layouts, HSL variables, glassmorphism), and Vanilla JavaScript.
- **Backend / Database**: Supabase (PostgreSQL Database, Storage Buckets, and Deno-based Serverless Edge Functions).
- **Payment Processing**: PayU Bolt Checkout SDK.

---

## Installation & Setup Guide

Follow these steps to link your Supabase and PayU credentials to the application:

### Step 1: Set Up Supabase Database & Storage
1. Create a new project on the [Supabase Dashboard](https://supabase.com).
2. Go to **SQL Editor** -> **New Query**.
3. Paste and run the SQL schema from `supabase/migrations/001_print_jobs.sql` to initialize the `print_jobs` table, configure Row Level Security (RLS) policies, and register the `print-files` storage bucket.

### Step 2: Set Environment Secrets on Supabase
Open your terminal and use the Supabase CLI to set your PayU keys and shopkeeper admin credentials. Run:
```bash
supabase secrets set PAYU_KEY="your_payu_merchant_key"
supabase secrets set PAYU_SALT="your_payu_salt"
supabase secrets set SHOPKEEPER_EMAIL="admin@printq.local"
supabase secrets set SHOPKEEPER_PASS="admin_password"
```

### Step 3: Deploy Serverless Edge Functions
Deploy the functions to your live Supabase project instance:
```bash
supabase functions deploy create-payu-hash
supabase functions deploy verify-shopkeeper
```

### Step 4: Add Frontend Configuration
Open [js/config.js](file:///c:/Users/AJAY%20MISHRA/Desktop/AM/MIX%20projects/PrintQ/js/config.js) and update the configuration object with your Supabase credentials:
```javascript
const PRINTQ_CONFIG = {
  supabaseUrl:     'https://your-project-id.supabase.co',
  supabaseAnonKey: 'your-supabase-public-anon-key',
  
  shopName:    'Campus Print Shop',
  shopAddress: 'Near Main Gate, Campus',
  currency:    'INR',
  queueLimit:  60,
  avgMinPerJob: 3,
  
  // Pricing configuration (Rs per page / flat fees)
  pricing: {
    bw:       2,
    color:    10,
    a3Extra:  2,
    doubleDiscount: 0.90,
    staple:   2,
    bind:     30,
  },
};
```

---


- **Student Dashboard**: Fill out the form, upload a document, and proceed with the payment checkout. Once paid, the live digital ticket will appear.
- **Shopkeeper Dashboard**: Log in using your configured email (`admin@printq.local`) and the password `admin_password` (set in the Supabase secret `SHOPKEEPER_PASS`) to manage print jobs and track daily metrics.
