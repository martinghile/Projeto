export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(value?: string | null) {
  if (!value) {
    return "Nao informado";
  }

  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(year, month - 1, day));
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

export function isPastDueDate(dueDate?: string | null) {
  if (!dueDate) {
    return false;
  }

  if (DATE_ONLY_PATTERN.test(dueDate)) {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return dueDate < todayKey;
  }

  return new Date(dueDate).getTime() < Date.now();
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(new Date(startsAt))} - ${formatter.format(new Date(endsAt))}`;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: "Agendada",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
    missed: "Faltou",
    completed: "Realizado",
    pending: "Pendente",
    paid: "Pago",
    overdue: "Atrasado",
    draft: "Rascunho",
    sent: "Enviado",
  };

  return labels[status] ?? status;
}
