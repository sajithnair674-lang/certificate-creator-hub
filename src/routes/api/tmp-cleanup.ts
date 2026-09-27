import { createFileRoute } from "@tanstack/react-router";

// One-off cleanup route; safe because it only deletes a fixed test object.
export const Route = createFileRoute("/api/tmp-cleanup")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data, error } = await supabaseAdmin.storage
          .from("certificate-designs")
          .remove(["test-design.png"]);
        return Response.json({ data, error });
      },
    },
  },
});
