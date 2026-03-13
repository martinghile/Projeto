import type { PatientAddressFields, PatientItem } from "../supabase/types";

export const brazilStateOptions = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export interface PatientFormValues extends Required<PatientAddressFields> {
  fullName: string;
  phone: string;
  email: string;
  cpf: string;
  birthDate: string;
  notes: string;
  sessionPrice: string;
  isActive: boolean;
}

export interface ZipCodeLookupResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export const emptyPatientForm: PatientFormValues = {
  fullName: "",
  phone: "",
  email: "",
  cpf: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  birthDate: "",
  notes: "",
  sessionPrice: "180",
  isActive: true,
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function formatZipCode(value: string) {
  const digits = onlyDigits(value).slice(0, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

export function normalizeCpf(value: string) {
  return onlyDigits(value).slice(0, 11);
}

export function normalizeZipCode(value: string) {
  return onlyDigits(value).slice(0, 8);
}

export function isValidCpf(value: string) {
  const digits = normalizeCpf(value);

  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index);
  }

  let remainder = (sum * 10) % 11;
  remainder = remainder === 10 ? 0 : remainder;

  if (remainder !== Number(digits[9])) {
    return false;
  }

  sum = 0;

  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index);
  }

  remainder = (sum * 10) % 11;
  remainder = remainder === 10 ? 0 : remainder;

  return remainder === Number(digits[10]);
}

export function buildAddressLabel(address: PatientAddressFields & { address?: string | null }) {
  const streetLine = [
    [address.street, address.number].filter(Boolean).join(", "),
    address.complement,
  ]
    .filter(Boolean)
    .join(" - ");

  const parts = [
    streetLine,
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(" - "),
    address.zipCode ? `CEP ${formatZipCode(address.zipCode)}` : "",
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  return address.address ?? "";
}

export function buildPatientFormFromItem(patient: PatientItem): PatientFormValues {
  return {
    fullName: patient.fullName,
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    cpf: formatCpf(patient.cpf ?? ""),
    zipCode: formatZipCode(patient.zipCode ?? ""),
    street: patient.street ?? "",
    number: patient.number ?? "",
    complement: patient.complement ?? "",
    neighborhood: patient.neighborhood ?? "",
    city: patient.city ?? "",
    state: patient.state ?? "",
    birthDate: patient.birthDate ?? "",
    notes: patient.notes ?? "",
    sessionPrice: String(patient.sessionPrice),
    isActive: patient.isActive,
  };
}

export function validatePatientForm(form: PatientFormValues) {
  if (!form.fullName.trim()) {
    return "Informe o nome do paciente.";
  }

  if (!isValidCpf(form.cpf)) {
    return "Informe um CPF valido.";
  }

  if (normalizeZipCode(form.zipCode).length !== 8) {
    return "Informe um CEP valido com 8 numeros.";
  }

  if (!form.street.trim()) {
    return "Informe o logradouro.";
  }

  if (!form.number.trim()) {
    return "Informe o numero do endereco.";
  }

  if (!form.neighborhood.trim()) {
    return "Informe o bairro.";
  }

  if (!form.city.trim()) {
    return "Informe a cidade.";
  }

  if (!brazilStateOptions.includes(form.state.trim().toUpperCase() as (typeof brazilStateOptions)[number])) {
    return "Selecione um estado valido.";
  }

  if (!form.sessionPrice || Number(form.sessionPrice) <= 0) {
    return "Informe um valor de sessao valido.";
  }

  return "";
}

export async function lookupZipCode(zipCode: string): Promise<ZipCodeLookupResult> {
  const normalizedZipCode = normalizeZipCode(zipCode);

  if (normalizedZipCode.length !== 8) {
    throw new Error("Informe um CEP com 8 numeros.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${normalizedZipCode}/json/`);

  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o CEP agora.");
  }

  const data = (await response.json()) as {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };

  if (data.erro) {
    throw new Error("CEP nao encontrado.");
  }

  return {
    street: data.logradouro ?? "",
    neighborhood: data.bairro ?? "",
    city: data.localidade ?? "",
    state: (data.uf ?? "").toUpperCase(),
  };
}
