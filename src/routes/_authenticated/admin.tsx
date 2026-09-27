import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileUp,
  ImagePlus,
  LogOut,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/certificate-pdf";
import { getDesign } from "@/lib/design.functions";
import {
  DEFAULT_LAYOUT,
  FIELD_LABELS,
  loadDesignAsDataUrl,
  normalizeLayout,
  type DesignLayout,
  type FieldKey,
} from "@/lib/certificate-design";

const PAGE_SIZE = 25;

type Row = {
  id: string;
  register_number: string;
  student_name: string;
  course: string;
  issue_date: string;
  file_path: string | null;
};

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Manage certificates | Certificate Portal" },
      {
        name: "description",
        content:
          "Add, edit and remove certificate records that visitors verify and download.",
      },
      { property: "og:title", content: "Manage certificates" },
      {
        property: "og:description",
        content: "Add, edit and remove certificate records for the verification portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="p-8 text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="p-8">Not found.</p>,
});

function emptyForm() {
  return {
    register_number: "",
    student_name: "",
    course: "",
    issue_date: new Date().toISOString().slice(0, 10),
  };
}

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("claim_first_admin").then(({ data }) => setIsAdmin(!!data));
  }, []);

  const { data, isPending } = useQuery({
    queryKey: ["certificates", search, page],
    queryFn: async () => {
      let q = supabase
        .from("certificates")
        .select("id, register_number, student_name, course, issue_date, file_path", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`register_number.ilike.${term},student_name.ilike.${term}`);
      }
      const { data: rows, count, error } = await q;
      if (error) throw error;
      return { rows: (rows ?? []) as Row[], count: count ?? 0 };
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["certificates"] });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      register_number: form.register_number.trim(),
      student_name: form.student_name.trim(),
      course: form.course.trim(),
      issue_date: form.issue_date,
    };
    const { error } = editingId
      ? await supabase.from("certificates").update(payload).eq("id", editingId)
      : await supabase.from("certificates").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? "Record updated" : "Record added");
    setForm(emptyForm());
    setEditingId(null);
    refresh();
  }

  async function handleDelete(row: Row) {
    if (!confirm(`Delete the record for ${row.student_name}?`)) return;
    const { error } = await supabase.from("certificates").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Record deleted");
    refresh();
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRowRef = useRef<Row | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  function pickFileFor(row: Row) {
    uploadRowRef.current = row;
    fileInputRef.current?.click();
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const row = uploadRowRef.current;
    e.target.value = "";
    if (!file || !row) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is larger than 10 MB");
      return;
    }
    setUploadingId(row.id);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${row.id}/${Date.now()}-${safeName}`;
    const { error: upError } = await supabase.storage
      .from("student-certificates")
      .upload(path, file, file.type ? { contentType: file.type } : {});
    if (upError) {
      setUploadingId(null);
      toast.error(upError.message);
      return;
    }
    if (row.file_path) {
      await supabase.storage.from("student-certificates").remove([row.file_path]);
    }
    const { error: dbError } = await supabase
      .from("certificates")
      .update({ file_path: path })
      .eq("id", row.id);
    setUploadingId(null);
    if (dbError) {
      toast.error(dbError.message);
      return;
    }
    toast.success(`Certificate file attached to ${row.student_name}`);
    refresh();
  }

  async function handleRemoveFile(row: Row) {
    if (!row.file_path) return;
    if (!confirm(`Remove the uploaded certificate file for ${row.student_name}?`)) return;
    await supabase.storage.from("student-certificates").remove([row.file_path]);
    const { error } = await supabase
      .from("certificates")
      .update({ file_path: null })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Certificate file removed");
    refresh();
  }

  async function handleBulkImport() {
    const lines = bulk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const rows = lines.map((line) => {
      const [reg, name, course, date] = line.split(/\t|,/).map((v) => v?.trim() ?? "");
      return {
        register_number: reg ?? "",
        student_name: name ?? "",
        course: course ?? "",
        issue_date: date || new Date().toISOString().slice(0, 10),
      };
    });
    const valid = rows.filter((r) => r.register_number && r.student_name);
    if (!valid.length) {
      toast.error("Nothing to import. Use: register number, name, course, YYYY-MM-DD");
      return;
    }
    setBusy(true);
    let inserted = 0;
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const { error } = await supabase.from("certificates").insert(chunk);
      if (error) {
        setBusy(false);
        toast.error(`Stopped after ${inserted} records: ${error.message}`);
        refresh();
        return;
      }
      inserted += chunk.length;
    }
    setBusy(false);
    setBulk("");
    toast.success(`${inserted} records imported`);
    refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const total = data?.count ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Certificate records
            </h1>
            <p className="text-sm text-muted-foreground">{total} records</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Verification page
            </Link>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {isAdmin === false && (
          <p className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            This account is not an administrator, so saving changes will be rejected.
          </p>
        )}

        <form
          onSubmit={handleSave}
          className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-5"
        >
          <div className="grid gap-2">
            <Label htmlFor="f-reg">Register number</Label>
            <Input
              id="f-reg"
              value={form.register_number}
              onChange={(e) => setForm({ ...form, register_number: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="f-name">Student name</Label>
            <Input
              id="f-name"
              value={form.student_name}
              onChange={(e) => setForm({ ...form, student_name: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="f-course">Course</Label>
            <Input
              id="f-course"
              value={form.course}
              onChange={(e) => setForm({ ...form, course: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="f-date">Issue date</Label>
            <Input
              id="f-date"
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
              required
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={busy} className="flex-1">
              <Plus className="size-4" />
              {editingId ? "Update" : "Add"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm());
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>

        <details className="mt-4 rounded-2xl border border-border bg-card p-6">
          <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
            Import many records at once
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">
            One record per line: register number, name, course, date (YYYY-MM-DD). You
            can paste columns copied straight from a spreadsheet.
          </p>
          <Textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={6}
            className="mt-3 font-mono text-sm"
            placeholder={"EDU100, Arun Das, Web Design, 2026-05-12"}
          />
          <Button
            type="button"
            className="mt-3"
            onClick={handleBulkImport}
            disabled={busy}
          >
            <Upload className="size-4" />
            Import
          </Button>
        </details>

        <DesignSection />

        <div className="mt-8">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search by register number or name"
            className="max-w-sm"
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={handleFilePicked}
        />
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Register no.</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Course</th>
                <th className="px-5 py-3">Issue date</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isPending && !data?.rows.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-muted-foreground">
                    No records yet.
                  </td>
                </tr>
              )}
              {data?.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-medium text-card-foreground">
                    {row.register_number}
                  </td>
                  <td className="px-5 py-3">{row.student_name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{row.course}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatDate(row.issue_date)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={row.file_path ? "Replace certificate file" : "Upload certificate file"}
                        title={row.file_path ? "Replace certificate file" : "Upload certificate file"}
                        disabled={uploadingId === row.id}
                        onClick={() => pickFileFor(row)}
                      >
                        {row.file_path ? (
                          <FileCheck2 className="size-4 text-primary" />
                        ) : (
                          <FileUp className="size-4" />
                        )}
                      </Button>
                      {row.file_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove certificate file"
                          title="Remove certificate file"
                          onClick={() => handleRemoveFile(row)}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit"
                        onClick={() => {
                          setEditingId(row.id);
                          setForm({
                            register_number: row.register_number,
                            student_name: row.student_name,
                            course: row.course,
                            issue_date: row.issue_date,
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => handleDelete(row)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {lastPage + 1}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function DesignSection() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    key: FieldKey;
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);
  const { data: design } = useQuery({ queryKey: ["design"], queryFn: getDesign });
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [layout, setLayout] = useState<DesignLayout>(DEFAULT_LAYOUT);
  const [selected, setSelected] = useState<FieldKey>("name");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!design) {
      setPreview(null);
      setPreviewFailed(false);
      setLayout(DEFAULT_LAYOUT);
      return;
    }
    setLayout(normalizeLayout(design.layout));
    setPreview(null);
    setPreviewFailed(false);
    let cancelled = false;
    loadDesignAsDataUrl(design.url, design.mime)
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [design]);

  async function currentRow() {
    const { data } = await supabase
      .from("certificate_designs")
      .select("id, storage_path")
      .maybeSingle();
    return data;
  }

  async function handleUpload(file: File) {
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
      const path = `design-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("certificate-designs")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const old = await currentRow();
      if (old) {
        await supabase.from("certificate_designs").delete().eq("id", old.id);
        await supabase.storage.from("certificate-designs").remove([old.storage_path]);
      }
      const { error: rowError } = await supabase.from("certificate_designs").insert({
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        layout,
      });
      if (rowError) throw rowError;
      toast.success("Design uploaded");
      queryClient.invalidateQueries({ queryKey: ["design"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        "Remove the certificate design? Certificates will use the built-in layout again.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const old = await currentRow();
      if (old) {
        await supabase.from("certificate_designs").delete().eq("id", old.id);
        await supabase.storage.from("certificate-designs").remove([old.storage_path]);
      }
      toast.success("Design removed");
      queryClient.invalidateQueries({ queryKey: ["design"] });
    } finally {
      setBusy(false);
    }
  }

  async function saveLayout() {
    setBusy(true);
    try {
      const row = await currentRow();
      if (!row) {
        toast.error("Upload a design first");
        return;
      }
      const { error } = await supabase
        .from("certificate_designs")
        .update({ layout })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Positions saved");
      queryClient.invalidateQueries({ queryKey: ["design"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save positions");
    } finally {
      setBusy(false);
    }
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>, key: FieldKey) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      key,
      px: e.clientX,
      py: e.clientY,
      ox: layout[key].x,
      oy: layout[key].y,
    };
    setSelected(key);
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const dx = ((e.clientX - d.px) / box.clientWidth) * 100;
    const dy = ((e.clientY - d.py) / box.clientHeight) * 100;
    setLayout((prev) => ({
      ...prev,
      [d.key]: {
        ...prev[d.key],
        x: Math.min(100, Math.max(0, d.ox + dx)),
        y: Math.min(100, Math.max(0, d.oy + dy)),
      },
    }));
  }

  function endDrag() {
    drag.current = null;
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-card-foreground">
            Company certificate design
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Upload your own design from your desktop (image or PDF). When a visitor
            downloads a certificate, their details are printed onto this design.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleUpload(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {design ? "Replace design" : "Upload design"}
          </Button>
          {design && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={handleRemove}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {design && (
        <div className="mt-5">
          <div
            ref={boxRef}
            className="relative mx-auto max-w-2xl select-none overflow-hidden rounded-xl border border-border bg-muted"
            style={{ aspectRatio: "297 / 210" }}
          >
            {preview && (
              <img
                src={preview}
                alt="Certificate design preview"
                className="h-full w-full"
                draggable={false}
              />
            )}
            {!preview && !previewFailed && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading preview…
              </div>
            )}
            {previewFailed && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Preview unavailable — the file is still saved and used for downloads.
              </div>
            )}
            {(Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => (
              <div
                key={key}
                onPointerDown={(e) => startDrag(e, key)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm active:cursor-grabbing ${
                  selected === key
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                    : "bg-background/90 text-foreground"
                }`}
                style={{ left: `${layout[key].x}%`, top: `${layout[key].y}%` }}
              >
                {FIELD_LABELS[key]}
              </div>
            ))}
          </div>

          <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1">
              <Label htmlFor={`size-${selected}`}>
                Text size — {FIELD_LABELS[selected]}
              </Label>
              <input
                id={`size-${selected}`}
                type="range"
                min={8}
                max={60}
                value={layout[selected].size}
                onChange={(e) =>
                  setLayout((prev) => ({
                    ...prev,
                    [selected]: { ...prev[selected], size: Number(e.target.value) },
                  }))
                }
                className="mt-1 w-full"
                style={{ accentColor: "var(--primary)" }}
              />
            </div>
            <Button type="button" size="sm" disabled={busy} onClick={saveLayout}>
              <Save className="size-4" />
              Save positions
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-xs text-muted-foreground">
            Drag each label to where it should appear on your design, set its text
            size, then save. The preview shows exactly where details will print.
          </p>
        </div>
      )}
    </section>
  );
}
