export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
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
