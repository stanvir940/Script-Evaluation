import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://ohzcnhcqhudflywycjxz.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "sb_publishable_v-pnQyGVtSqHMdYFUCYjJw_zeqOZTah";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the server environment",
  );
}

// Service-role client: bypasses RLS, server-side only. Never send this key to any client app.
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);

export const SCRIPTS_TABLE = "scripts";
export const SCRIPTS_BUCKET = "scripts";
