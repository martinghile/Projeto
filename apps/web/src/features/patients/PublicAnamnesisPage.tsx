import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { fetchPublicAnamnesisByToken, submitPublicAnamnesis } from "../../lib/supabase/services";

const questionLabels: Record<string, string> = {
  motivo: "O que motivou a busca por terapia?",
  objetivo: "O que voce espera melhorar ou compreender neste processo?",
  historico: "Conte um pouco do seu historico emocional ou terapeutico.",
  contexto_familiar: "Como esta seu contexto familiar e de apoio hoje?",
  medicacoes: "Faz uso de medicacao ou acompanhamento medico? Se quiser, descreva.",
};

const orderedQuestions = Object.keys(questionLabels);

export function PublicAnamnesisPage() {
  const { shareToken = "" } = useParams();
  const [patientName, setPatientName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({
    motivo: "",
    objetivo: "",
    historico: "",
    contexto_familiar: "",
    medicacoes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchPublicAnamnesisByToken(shareToken)
      .then((result) => {
        if (!result) {
          setError("Link de anamnese invalido ou expirado.");
          return;
        }

        setPatientName(result.patientName);
        setAnswers((current) => ({
          ...current,
          ...result.answers,
        }));
        setSubmitted(result.status === "completed");
      })
      .catch((exception) => {
        const message = exception instanceof Error ? exception.message : "Nao foi possivel abrir a anamnese.";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [shareToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await submitPublicAnamnesis(shareToken, answers);
      setSubmitted(true);
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel enviar a anamnese.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page-state">Abrindo anamnese...</div>;
  }

  if (error && !patientName) {
    return <div className="page-state">{error}</div>;
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <p className="eyebrow">Formulario inicial</p>
        <h1>Anamnese</h1>
        <p className="muted">
          {patientName ? `Formulario de ${patientName}. Responda com calma, em texto livre.` : "Responda com calma, em texto livre."}
        </p>

        {submitted ? (
          <div className="info-strip">
            <strong>Formulario enviado</strong>
            <p className="muted">As respostas foram registradas com sucesso.</p>
          </div>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            {orderedQuestions.map((key) => (
              <label key={key}>
                {questionLabels[key]}
                <textarea
                  className="textarea-input"
                  rows={5}
                  required={key === "motivo" || key === "objetivo"}
                  value={answers[key] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}

            {error ? <p className="error-text">{error}</p> : null}

            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Enviando..." : "Enviar anamnese"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
