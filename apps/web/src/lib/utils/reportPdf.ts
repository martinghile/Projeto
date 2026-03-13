import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { ReportSnapshot } from "../supabase/types";

interface ReportPdfOptions {
  clinicName: string;
  professionalName: string;
  reportLabel: string;
}

const COLORS = {
  dark: [8, 13, 56] as const,
  teal: [72, 203, 211] as const,
  blue: [76, 96, 216] as const,
  purple: [181, 91, 232] as const,
  slate: [103, 115, 164] as const,
  soft: [217, 217, 217] as const,
  paper: [245, 247, 255] as const,
  white: [255, 255, 255] as const,
  ink: [19, 26, 72] as const,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

function addHeader(doc: jsPDF, title: string, options: ReportPdfOptions) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...COLORS.dark);
  doc.roundedRect(14, 12, pageWidth - 28, 42, 8, 8, "F");

  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ClinGestor", 20, 28);

  doc.text(title, 20, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Clinica: ${options.clinicName}`, pageWidth - 20, 24, { align: "right" });
  doc.text(`Responsavel: ${options.professionalName}`, pageWidth - 20, 30, { align: "right" });
  doc.text(`Periodo: ${options.reportLabel}`, pageWidth - 20, 36, { align: "right" });
  doc.text(
    `Gerado em: ${new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date())}`,
    pageWidth - 20,
    42,
    { align: "right" },
  );
}

function addMetricCards(doc: jsPDF, metrics: Array<{ label: string; value: string }>, startY: number) {
  const cardWidth = 43;
  const gap = 4;

  metrics.forEach((metric, index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(...COLORS.paper);
    doc.setDrawColor(...COLORS.soft);
    doc.roundedRect(x, startY, cardWidth, 24, 5, 5, "FD");

    doc.setTextColor(...COLORS.slate);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(metric.label, x + 4, startY + 7);

    doc.setTextColor(...COLORS.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(metric.value, x + 4, startY + 15);
  });
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setDrawColor(...COLORS.soft);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.slate);
    doc.text("ClinGestor • Relatorio gerado automaticamente", 14, pageHeight - 7);
    doc.text(`Pagina ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }
}

function savePdf(doc: jsPDF, fileName: string) {
  addFooter(doc);
  doc.save(fileName);
}

export async function exportFinancialReportPdf(snapshot: ReportSnapshot, options: ReportPdfOptions) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  addHeader(doc, "Relatorio Financeiro", options);
  addMetricCards(
    doc,
    [
      { label: "Recebido no periodo", value: formatCurrency(snapshot.receivedAmount) },
      { label: "Pendente no periodo", value: formatCurrency(snapshot.pendingAmount) },
      { label: "Pagamentos pendentes", value: String(snapshot.pendingPayments) },
      { label: "Pagamentos atrasados", value: String(snapshot.overduePayments) },
    ],
    62,
  );

  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resumo de movimentacao", 14, 96);

  autoTable(doc, {
    startY: 101,
    theme: "grid",
    headStyles: {
      fillColor: [...COLORS.dark],
      textColor: [...COLORS.white],
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [...COLORS.ink],
      fillColor: [...COLORS.white],
    },
    alternateRowStyles: {
      fillColor: [...COLORS.paper],
    },
    styles: {
      cellPadding: 3.4,
      fontSize: 9,
      lineColor: [...COLORS.soft],
      lineWidth: 0.2,
    },
    head: [["Mes", "Recebido", "Pendente", "Clientes atendidos", "Sessoes realizadas"]],
    body: snapshot.timeline.map((point) => [
      point.label,
      formatCurrency(point.receivedAmount),
      formatCurrency(point.pendingAmount),
      String(point.attendedPatients),
      String(point.completedSessions),
    ]),
  });

  const paymentsTableY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Lancamentos do periodo", 14, paymentsTableY + 12);

  autoTable(doc, {
    startY: paymentsTableY + 16,
    theme: "grid",
    headStyles: {
      fillColor: [...COLORS.blue],
      textColor: [...COLORS.white],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [...COLORS.paper],
    },
    styles: {
      cellPadding: 3.2,
      fontSize: 8.5,
      lineColor: [...COLORS.soft],
      lineWidth: 0.2,
    },
    head: [["Paciente", "Vencimento", "Status", "Valor", "Recebido em"]],
    body: snapshot.payments.map((payment) => [
      payment.patientName,
      formatDate(payment.dueDate),
      payment.status,
      formatCurrency(payment.amount),
      formatDate(payment.paidAt),
    ]),
  });

  savePdf(
    doc,
    `relatorio-financeiro-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}.pdf`,
  );
}

export async function exportSessionsReportPdf(snapshot: ReportSnapshot, options: ReportPdfOptions) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  addHeader(doc, "Relatorio de Sessoes", options);
  addMetricCards(
    doc,
    [
      { label: "Sessoes do periodo", value: String(snapshot.sessions.length) },
      { label: "Realizadas", value: String(snapshot.completedSessions) },
      {
        label: "Confirmadas",
        value: String(snapshot.sessionSummary.find((item) => item.status === "confirmed")?.count ?? 0),
      },
      { label: "Faltas", value: String(snapshot.missedSessions) },
    ],
    62,
  );

  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resumo por status", 14, 96);

  autoTable(doc, {
    startY: 101,
    theme: "grid",
    headStyles: {
      fillColor: [...COLORS.dark],
      textColor: [...COLORS.white],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [...COLORS.paper],
    },
    styles: {
      cellPadding: 3.4,
      fontSize: 9,
      lineColor: [...COLORS.soft],
      lineWidth: 0.2,
    },
    head: [["Status", "Quantidade"]],
    body: snapshot.sessionSummary.map((item) => [item.label, String(item.count)]),
  });

  const topPatientsY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Pacientes com maior volume de atendimento", 14, topPatientsY + 12);

  autoTable(doc, {
    startY: topPatientsY + 16,
    theme: "grid",
    headStyles: {
      fillColor: [...COLORS.purple],
      textColor: [...COLORS.white],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [...COLORS.paper],
    },
    styles: {
      cellPadding: 3.2,
      fontSize: 8.6,
      lineColor: [...COLORS.soft],
      lineWidth: 0.2,
    },
    head: [["Paciente", "Sessoes realizadas", "Valor realizado"]],
    body: snapshot.topPatients.map((patient) => [
      patient.patientName,
      String(patient.sessionCount),
      formatCurrency(patient.revenue),
    ]),
  });

  const sessionsTableY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 160;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Tabela de sessoes do periodo", 14, sessionsTableY + 12);

  autoTable(doc, {
    startY: sessionsTableY + 16,
    theme: "grid",
    headStyles: {
      fillColor: [...COLORS.dark],
      textColor: [...COLORS.white],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [...COLORS.paper],
    },
    styles: {
      cellPadding: 2.8,
      fontSize: 8.1,
      lineColor: [...COLORS.soft],
      lineWidth: 0.2,
    },
    head: [["Paciente", "Data e horario", "Status", "Valor", "Local"]],
    body: snapshot.sessions.map((session) => [
      session.patientName,
      formatDateTime(session.startsAt),
      session.status,
      formatCurrency(session.sessionPrice),
      session.location ?? "Sem local",
    ]),
  });

  savePdf(
    doc,
    `relatorio-sessoes-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}.pdf`,
  );
}
