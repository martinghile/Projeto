import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { SectionCard } from "../../components/SectionCard";
import { createPatient, fetchPatients } from "../../lib/supabase/services";
import type { PatientItem } from "../../lib/supabase/types";
import { getErrorMessage } from "../../lib/utils/errors";
import { formatCurrency } from "../../lib/utils/format";
import { emptyPatientForm, validatePatientForm } from "../../lib/utils/patient";
import { PatientFormFields } from "./PatientFormFields";

export function PatientsPage() {
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [form, setForm] = useState(emptyPatientForm);

  useEffect(() => {
    fetchPatients()
      .then((result) => setPatients(result))
      .catch((exception) => {
        const message = getErrorMessage(exception, "Nao foi possivel carregar os pacientes.");
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredPatients = patients.filter((patient) =>
    [patient.fullName, patient.cpf ?? ""].some((value) => value.toLowerCase().includes(search.toLowerCase())),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setFeedback("");

    try {
      const validationMessage = validatePatientForm(form);

      if (validationMessage) {
        setFormError(validationMessage);
        return;
      }

      const createdPatient = await createPatient({
        fullName: form.fullName.trim(),
        phone: form.phone,
        email: form.email,
        cpf: form.cpf,
        zipCode: form.zipCode,
        street: form.street,
        number: form.number,
        complement: form.complement,
        neighborhood: form.neighborhood,
        city: form.city,
        state: form.state,
        birthDate: form.birthDate,
        notes: form.notes,
        sessionPrice: Number(form.sessionPrice),
      });

      setPatients((current) =>
        [...current, createdPatient].sort((left, right) => left.fullName.localeCompare(right.fullName)),
      );
      setForm(emptyPatientForm);
      setShowForm(false);
      setFeedback("Paciente cadastrado com sucesso.");
    } catch (exception) {
      const message = getErrorMessage(exception, "Nao foi possivel cadastrar o paciente.");
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Pacientes"
        subtitle="Cadastro direto e ficha clinica em abas."
        action={
          <button className="primary-button" type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Fechar cadastro" : "Novo paciente"}
          </button>
        }
      >
        {showForm ? (
          <form className="form-grid" onSubmit={handleSubmit}>
            <PatientFormFields form={form} setForm={setForm} />

            {formError ? <p className="error-text">{formError}</p> : null}

            <div className="button-row">
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar paciente"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setForm(emptyPatientForm);
                  setShowForm(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="toolbar">
          <input
            className="text-input"
            type="search"
            placeholder="Buscar paciente por nome ou CPF"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {feedback ? <p className="success-text">{feedback}</p> : null}
        {loading ? <div className="page-state">Carregando pacientes...</div> : null}
        {!loading && error ? <div className="page-state">{error}</div> : null}

        {!loading && !error ? (
          <div className="stack-list">
            {filteredPatients.map((patient) => (
              <Link key={patient.id} to={`/pacientes/${patient.id}`} className="patient-row">
                <div>
                  <strong>{patient.fullName}</strong>
                  <p className="muted">
                    {patient.phone ?? "Sem telefone"} • {patient.email ?? "Sem email"}
                  </p>
                  <p className="muted">
                    {patient.cpf ? `CPF ${patient.cpf}` : "CPF nao informado"}
                  </p>
                </div>
                <div className="patient-row__meta">
                  <span>{formatCurrency(patient.sessionPrice)}</span>
                  <span className={patient.isActive ? "pill pill--success" : "pill pill--muted"}>
                    {patient.isActive ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
