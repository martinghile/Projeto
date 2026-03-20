import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    let robotsTag = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    let createdTag = false;

    if (!robotsTag) {
      robotsTag = document.createElement("meta");
      robotsTag.name = "robots";
      document.head.appendChild(robotsTag);
      createdTag = true;
    }

    const previousContent = robotsTag.content;
    robotsTag.content = "noindex,nofollow";

    return () => {
      if (createdTag) {
        robotsTag?.remove();
        return;
      }

      robotsTag.content = previousContent;
    };
  }, []);

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
      if (!consentChecked) {
        setError("Marque o aceite antes de enviar a anamnese.");
        return;
      }

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
          {patientName
            ? "Formulario compartilhado com a clinica responsavel. Responda com calma, em texto livre."
            : "Responda com calma, em texto livre."}
        </p>

        {submitted ? (
          <div className="info-strip">
            <strong>Formulario enviado</strong>
            <p className="muted">As respostas foram registradas com sucesso.</p>
          </div>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="info-strip">
              <strong>Privacidade do formulario</strong>
              <p className="muted">
                Preencha este formulario apenas em um dispositivo de sua confianca. O link possui expiracao e os dados
                enviados serao usados pela clinica responsavel para fins de atendimento.
              </p>
            </div>

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

            <label className="consent-box">
              <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} />
              <span>
                Li o aviso acima e autorizo o envio destas informacoes para a clinica responsavel pelo meu atendimento.
              </span>
            </label>

            {error ? <p className="error-text">{error}</p> : null}

            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Enviando..." : "Enviar anamnese"}
            </button>

            <div className="legal-links">
              <Link className="text-link" to="/privacidade">
                Ver resumo de privacidade
              </Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
