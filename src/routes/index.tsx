import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BadgeCheck,
  Briefcase,
  Calendar,
  Check,
  Download,
  Hash,
  Loader2,
  Search,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  downloadCertificatePdf,
  formatDate,
  type CertificateRecord,
  type DesignContext,
} from "@/lib/certificate-pdf";
import { getDesign } from "@/lib/design.functions";
import { getStudentCertificateFile } from "@/lib/student-certificate.functions";
import { loadDesignAsDataUrl, normalizeLayout } from "@/lib/certificate-design";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Certificate Verification & Download" },
      {
        name: "description",
        content:
          "Enter your register number and name to verify your certificate and download it as a PDF.",
      },
      { property: "og:title", content: "Certificate Verification & Download" },
      {
        property: "og:description",
        content:
          "Verify a certificate with a register number and name, then download the official PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const [registerNumber, setRegisterNumber] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<CertificateRecord | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const reg = registerNumber.trim();
    const nm = name.trim();
    if (!reg || !nm) {
      setError("Please enter both the register number and the name.");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("certificates")
      .select("register_number, student_name, course, issue_date, file_path")
      .ilike("register_number", reg)
      .ilike("student_name", nm)
      .maybeSingle();
    setLoading(false);

    if (queryError) {
      setError("Something went wrong. Please try again.");
      return;
    }
    if (!data) {
      setError("No certificate found for that register number and name.");
      return;
    }
    setRecord(data as CertificateRecord);
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/70 bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <BadgeCheck className="size-5 text-primary" />
            Certificate Portal
          </span>
          <Link
            to="/admin"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Admin
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-5 pt-16 pb-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Official verification
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Verify & download your certificate
        </h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          Enter your register number and full name exactly as issued.
        </p>

        <form
          onSubmit={handleVerify}
          className="mt-10 rounded-2xl border border-border bg-card p-6 text-left shadow-sm sm:p-8"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="reg">Register number</Label>
              <Input
                id="reg"
                value={registerNumber}
                onChange={(e) => setRegisterNumber(e.target.value)}
                placeholder="EDU001"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rahul Kumar"
                autoComplete="off"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Verify
          </Button>
        </form>
      </section>

      {record && (
        <VerifiedDialog record={record} onClose={() => setRecord(null)} />
      )}
    </main>
  );
}

function DetailRow({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 py-4 ${last ? "" : "border-b border-border"}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="block truncate text-lg font-semibold text-card-foreground">
          {value}
        </span>
      </span>
    </div>
  );
}

function VerifiedDialog({
  record,
  onClose,
}: {
  record: CertificateRecord;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      // If the admin uploaded the student's actual certificate file, download it.
      const uploaded = await getStudentCertificateFile({
        data: {
          registerNumber: record.register_number,
          studentName: record.student_name,
        },
      });
      if (uploaded) {
        const res = await fetch(uploaded.url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = uploaded.fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const design = await getDesign();
      if (design) {
        const dataUrl = await loadDesignAsDataUrl(design.url, design.mime);
        downloadCertificatePdf(record, { dataUrl, layout: normalizeLayout(design.layout) });
      } else {
        downloadCertificatePdf(record);
      }
    } catch {
      downloadCertificatePdf(record);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Certificate verified"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-card"
        style={{ boxShadow: "var(--shadow-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative px-6 pt-10 pb-8 text-center"
          style={{ background: "var(--gradient-verified)" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-primary-foreground/20 text-primary-foreground transition-colors hover:bg-primary-foreground/30"
          >
            <X className="size-4" />
          </button>
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary-foreground/20 text-primary-foreground">
            <Check className="size-8" strokeWidth={3} />
          </span>
          <h2 className="mt-5 text-2xl font-bold text-primary-foreground">
            Certificate Verified
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.15em] text-primary-foreground/70">
            Official record
          </p>
        </div>

        <div className="px-6 pt-2 pb-7">
          <DetailRow
            icon={<User className="size-4" />}
            label="Student name"
            value={record.student_name}
          />
          <DetailRow
            icon={<Briefcase className="size-4" />}
            label="Course"
            value={record.course || "—"}
          />
          <DetailRow
            icon={<Calendar className="size-4" />}
            label="Issue date"
            value={formatDate(record.issue_date)}
          />
          <DetailRow
            icon={<Hash className="size-4" />}
            label="Register number"
            value={record.register_number}
            last
          />

          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={downloading}
            onClick={handleDownload}
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download Certificate
          </Button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-primary">
            <Check className="size-4" strokeWidth={3} />
            Verified &amp; Authentic
          </p>
        </div>
      </div>
    </div>
  );
}
