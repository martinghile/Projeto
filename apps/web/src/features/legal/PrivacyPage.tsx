import { Link } from "react-router-dom";

export function PrivacyPage() {
  return (
    <div className="login-page">
      <section className="login-card">
        <p className="eyebrow">Privacidade e LGPD</p>
        <h1>Como o ClinPlanner trata dados</h1>
        <p className="muted">
          Esta pagina resume o tratamento de dados do sistema para apresentacao do produto. Ela nao substitui
          assessoria juridica, mas deixa claro o minimo operacional que o software espera em producao.
        </p>

        <div className="stack-list">
          <div className="info-strip">
            <strong>Dados tratados</strong>
            <p className="muted">
              O sistema pode armazenar cadastro de pacientes, agenda, financeiro, prontuario clinico, anamnese e
              comprovantes. Esses dados sao protegidos por autenticacao, isolamento por tenant e bucket privado para
              anexos financeiros.
            </p>
          </div>

          <div className="info-strip">
            <strong>Base operacional minima</strong>
            <p className="muted">
              Em producao, a clinica responsavel deve informar a finalidade do tratamento, a base legal aplicavel,
              prazos de retencao e canal para exercicio dos direitos do titular.
            </p>
          </div>

          <div className="info-strip">
            <strong>Fluxo publico de anamnese</strong>
            <p className="muted">
              Os links publicos de anamnese possuem expiracao, nao exibem o nome completo do paciente e registram
              abertura do link para auditoria minima. Sempre que possivel, compartilhe o link apenas com o titular.
            </p>
          </div>

          <div className="info-strip">
            <strong>Modo demonstracao</strong>
            <p className="muted">
              A demonstracao do produto usa apenas dados ficticios e temporarios no navegador. Eles nao devem ser
              usados para atendimento real e sao removidos automaticamente ao final da sessao.
            </p>
          </div>

          <div className="info-strip">
            <strong>Boas praticas recomendadas</strong>
            <p className="muted">
              Use HTTPS, mantenha a service role fora do frontend, restrinja as origens do servico do WhatsApp e
              documente politica de privacidade, retencao, incidentes e atendimento aos direitos do titular.
            </p>
          </div>
        </div>

        <div className="legal-links">
          <Link className="secondary-button secondary-button--link" to="/login">
            Voltar para o login
          </Link>
        </div>
      </section>
    </div>
  );
}
