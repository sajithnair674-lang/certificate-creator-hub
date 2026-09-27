import { jsPDF } from "jspdf";
import { DEFAULT_LAYOUT, formatDate, type DesignLayout } from "@/lib/certificate-design";

export type CertificateRecord = {
  register_number: string;
  student_name: string;
  course: string;
  issue_date: string;
};

export type DesignContext = {
  dataUrl: string;
  layout: DesignLayout;
};

export function formatDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function drawOnDesign(doc: jsPDF, record: CertificateRecord, design: DesignContext) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const layout = design.layout ?? DEFAULT_LAYOUT;

  doc.addImage(design.dataUrl, "JPEG", 0, 0, w, h);

  doc.setTextColor(26, 26, 26);
  doc.setFont("times", "bolditalic");
  doc.setFontSize(layout.name.size);
  doc.text(record.student_name, (layout.name.x / 100) * w, (layout.name.y / 100) * h, {
    align: "center",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(layout.course.size);
  doc.text(record.course || "—", (layout.course.x / 100) * w, (layout.course.y / 100) * h, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(layout.date.size);
  doc.text(formatDate(record.issue_date), (layout.date.x / 100) * w, (layout.date.y / 100) * h, {
    align: "center",
  });

  doc.setFontSize(layout.reg.size);
  doc.text(record.register_number, (layout.reg.x / 100) * w, (layout.reg.y / 100) * h, {
    align: "center",
  });
}

/**
 * Draws the certificate. Pass design (the uploaded artwork plus the position
 * of each detail) to print the record onto the company design instead of the
 * built-in layout.
 */
export function downloadCertificatePdf(record: CertificateRecord, design?: DesignContext) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  if (design) {
    drawOnDesign(doc, record, design);
  } else {
    doc.setFillColor(252, 253, 251);
    doc.rect(0, 0, w, h, "F");

    doc.setFillColor(29, 71, 50);
    doc.rect(0, 0, w, 14, "F");
    doc.rect(0, h - 14, w, 14, "F");

    doc.setDrawColor(29, 71, 50);
    doc.setLineWidth(2.5);
    doc.rect(34, 34, w - 68, h - 68);
    doc.setLineWidth(0.8);
    doc.rect(44, 44, w - 88, h - 88);
  }

  if (!design) {
    doc.setTextColor(29, 71, 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.text("CERTIFICATE OF COMPLETION", w / 2, 128, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(110, 120, 112);
    doc.text("This certificate is proudly presented to", w / 2, 168, {
      align: "center",
    });

    doc.setFont("times", "bolditalic");
    doc.setFontSize(44);
    doc.setTextColor(24, 46, 34);
    doc.text(record.student_name, w / 2, 234, { align: "center" });

    doc.setDrawColor(190, 205, 194);
    doc.setLineWidth(1);
    doc.line(w / 2 - 190, 252, w / 2 + 190, 252);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(90, 100, 92);
    doc.text("for successfully completing the course", w / 2, 286, {
      align: "center",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(29, 71, 50);
    doc.text(record.course || "—", w / 2, 320, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(110, 120, 112);
    doc.text(`Register Number: ${record.register_number}`, 90, h - 96);
    doc.text(`Date of Issue: ${formatDate(record.issue_date)}`, 90, h - 76);

    doc.setDrawColor(150, 165, 154);
    doc.line(w - 250, h - 96, w - 90, h - 96);
    doc.text("Authorised Signatory", w - 170, h - 78, { align: "center" });
  }

  doc.save(`certificate-${record.register_number}.pdf`);
}
