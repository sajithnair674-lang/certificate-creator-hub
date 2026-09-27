import { createServerFn } from "@tanstack/react-start";
import type { DesignLayout } from "@/lib/certificate-design";

export type DesignPayload = {
  url: string;
  mime: string;
  fileName: string;
  layout: DesignLayout;
} | null;

/**
 * Public: returns a short-lived link to the uploaded certificate design so
 * the verification page can place it behind the student details in the PDF.
 */
export const getDesign = createServerFn({ method: "GET" }).handler(
  async (): Promise<DesignPayload> => {
    const { createClient } = await import("@supabase/supabase-js");
    const pub = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: row, error } = await pub
      .from("certificate_designs")
      .select("storage_path, file_name, mime_type, layout")
      .maybeSingle();
    if (error || !row) return null;

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("certificate-designs")
      .createSignedUrl(row.storage_path, 3600);
    if (signError || !signed) return null;

    return {
      url: signed.signedUrl,
      mime: row.mime_type,
      fileName: row.file_name,
      layout: row.layout,
    };
  },
);
