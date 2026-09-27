import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public: after a visitor verifies a register number + name pair, returns a
 * short-lived link to that student's uploaded certificate file (if any).
 * The pair must match a record that actually has a file attached.
 */
export const getStudentCertificateFile = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({ registerNumber: z.string().min(1), studentName: z.string().min(1) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const pub = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: row, error } = await pub
      .from("certificates")
      .select("file_path")
      .ilike("register_number", data.registerNumber.trim())
      .ilike("student_name", data.studentName.trim())
      .maybeSingle();
    if (error || !row?.file_path) return null;

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("student-certificates")
      .createSignedUrl(row.file_path, 300);
    if (signError || !signed) return null;

    const fileName = row.file_path.split("/").pop() ?? "certificate";
    return { url: signed.signedUrl, fileName };
  });
