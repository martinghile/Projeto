import { type Dispatch, type SetStateAction, useState } from "react";

import {
  brazilStateOptions,
  formatCpf,
  formatZipCode,
  lookupZipCode,
  type PatientFormValues,
} from "../../lib/utils/patient";

interface PatientFormFieldsProps {
  form: PatientFormValues;
  setForm: Dispatch<SetStateAction<PatientFormValues>>;
  showStatusField?: boolean;
}

export function PatientFormFields({ form, setForm, showStatusField = false }: PatientFormFieldsProps) {
  const [zipCodeLoading, setZipCodeLoading] = useState(false);
  const [zipCodeError, setZipCodeError] = useState("");
  const [zipCodeFeedback, setZipCodeFeedback] = useState("");

  async function handleZipCodeLookup() {
    setZipCodeLoading(true);
    setZipCodeError("");
    setZipCodeFeedback("");

    try {
      const result = await lookupZipCode(form.zipCode);
      setForm((current) => ({
        ...current,
        zipCode: formatZipCode(current.zipCode),
        street: result.street || current.street,
        neighborhood: result.neighborhood || current.neighborhood,
        city: result.city || current.city,
        state: result.state || current.state,
      }));
      setZipCodeFeedback("CEP encontrado.");
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel buscar o CEP.";
      setZipCodeError(message);
    } finally {
      setZipCodeLoading(false);
    }
  }

  return (
    <>
      <div className="field-grid">
        <label>
          Nome
          <input
            className="text-input"
            type="text"
            required
            value={form.fullName}
            onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
          />
        </label>

        <label>
          Valor da sessao
          <input
            className="text-input"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.sessionPrice}
            onChange={(event) => setForm((current) => ({ ...current, sessionPrice: event.target.value }))}
          />
        </label>

        <label>
          Telefone
          <input
            className="text-input"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          />
        </label>

        <label>
          Email
          <input
            className="text-input"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
        </label>

        <label>
          CPF
          <input
            className="text-input"
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={(event) => setForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
          />
        </label>

        <label>
          Data de nascimento
          <input
            className="text-input"
            type="date"
            value={form.birthDate}
            onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
          />
        </label>

        <label>
          CEP
          <div className="inline-field">
            <input
              className="text-input"
              type="text"
              inputMode="numeric"
              placeholder="00000-000"
              value={form.zipCode}
              onBlur={() => {
                if (form.zipCode.replace(/\D/g, "").length === 8) {
                  void handleZipCodeLookup();
                }
              }}
              onChange={(event) => setForm((current) => ({ ...current, zipCode: formatZipCode(event.target.value) }))}
            />
            <button className="secondary-button" type="button" disabled={zipCodeLoading} onClick={() => void handleZipCodeLookup()}>
              {zipCodeLoading ? "Buscando..." : "Buscar CEP"}
            </button>
          </div>
          {zipCodeError ? <span className="error-text small">{zipCodeError}</span> : null}
          {zipCodeFeedback ? <span className="success-text small">{zipCodeFeedback}</span> : null}
        </label>

        <label>
          Logradouro
          <input
            className="text-input"
            type="text"
            value={form.street}
            onChange={(event) => setForm((current) => ({ ...current, street: event.target.value }))}
          />
        </label>

        <label>
          Numero
          <input
            className="text-input"
            type="text"
            value={form.number}
            onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
          />
        </label>

        <label>
          Complemento
          <input
            className="text-input"
            type="text"
            placeholder="Apto, sala, bloco..."
            value={form.complement}
            onChange={(event) => setForm((current) => ({ ...current, complement: event.target.value }))}
          />
        </label>

        <label>
          Bairro
          <input
            className="text-input"
            type="text"
            value={form.neighborhood}
            onChange={(event) => setForm((current) => ({ ...current, neighborhood: event.target.value }))}
          />
        </label>

        <label>
          Cidade
          <input
            className="text-input"
            type="text"
            value={form.city}
            onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
          />
        </label>

        <label>
          Estado
          <select
            className="text-input"
            value={form.state}
            onChange={(event) =>
              setForm((current) => ({ ...current, state: event.target.value.toUpperCase() }))
            }
          >
            <option value="">Selecione</option>
            {brazilStateOptions.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        {showStatusField ? (
          <label>
            Status
            <select
              className="text-input"
              value={form.isActive ? "active" : "inactive"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.value === "active",
                }))
              }
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
        ) : null}
      </div>

      <label>
        Observacoes
        <textarea
          className="textarea-input"
          rows={4}
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        />
      </label>
    </>
  );
}
