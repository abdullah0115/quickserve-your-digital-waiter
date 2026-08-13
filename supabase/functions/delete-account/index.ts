// Permanently deletes the caller's account and every business they own.
// This must stay server-side: only the service role can delete auth.users.
// Supabase Edge Functions run on Deno. The npm: specifier bundles this
// dependency for deployment and provides its TypeScript declarations.
import { createClient } from "npm:@supabase/supabase-js@2.45.6";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get(name: string): string | undefined };
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

  let body: { confirmation?: unknown };
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Invalid JSON body" }, 400);
  }
  if (body.confirmation !== "DELETE") {
    return respond({ error: "Type DELETE to confirm account deletion" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData, error: userError } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  );
  if (userError || !userData.user) return respond({ error: "Not authenticated" }, 401);

  const userId = userData.user.id;
  const { data: businesses, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId);
  if (businessError) {
    console.error("delete-account: couldn't read businesses", businessError);
    return respond({ error: "Couldn't prepare your account for deletion. Please try again." }, 500);
  }

  // Storage objects do not have database foreign keys, so remove each owned
  // folder before deleting auth.users. If cleanup fails, leave the account
  // untouched so the user can retry instead of creating orphaned files.
  for (const business of businesses ?? []) {
    const { data: files, error: listError } = await supabase.storage
      .from("menu-images")
      .list(business.id, { limit: 1000 });
    if (listError) {
      console.error("delete-account: couldn't list storage", listError);
      return respond({ error: "Couldn't remove your uploaded images. Please try again." }, 500);
    }
    const paths: string[] = [];
    for (const file of files ?? []) {
      if (file.name) paths.push(`${business.id}/${file.name}`);
    }
    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from("menu-images").remove(paths);
      if (removeError) {
        console.error("delete-account: couldn't remove storage", removeError);
        return respond({ error: "Couldn't remove your uploaded images. Please try again." }, 500);
      }
    }

    // rate_limit_hits deliberately has no FK; remove the business-scoped
    // scanner records explicitly so account deletion doesn't retain them.
    const { error: rateLimitError } = await supabase
      .from("rate_limit_hits")
      .delete()
      .like("bucket_key", `scan_menu:business:${business.id}%`);
    if (rateLimitError) {
      console.error("delete-account: couldn't remove usage records", rateLimitError);
      return respond({ error: "Couldn't clear your account data. Please try again." }, 500);
    }
  }

  // businesses.owner_id and user_roles.user_id both cascade from auth.users;
  // their dependent menu, order, QR, subscription and notification records
  // cascade from businesses as defined in the schema.
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("delete-account: couldn't delete auth user", deleteError);
    return respond({ error: "Couldn't delete your account. Please try again." }, 500);
  }

  return respond({ success: true });
});
