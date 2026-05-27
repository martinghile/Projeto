# ClinPlanner

SaaS para psicologos com gestao de agenda, pacientes, prontuarios, financeiro e lembretes via WhatsApp.

- `React + Vite + TypeScript` para a interface web responsiva
- `Supabase` para Auth, PostgreSQL, Storage e API
- `Baileys` para lembretes automaticos via WhatsApp (sem Puppeteer, via WebSocket direto)

---

## Arquitetura de Deploy

| Camada | Tecnologia | Hospedagem | URL |
|--------|-----------|------------|-----|
| Frontend (SPA) | React + Vite | Vercel | `https://clinplanner.vercel.app` |
| Banco de dados | PostgreSQL | Supabase | `qsbtmnsibxrnecynmhdp.supabase.co` |
| WhatsApp bot | Node.js + Baileys | Render (free) | `https://clinplanner-whatsapp.onrender.com` |

Repositorio: `https://github.com/martinghile/Projeto`

## Estrutura de pastas

```text
apps/
  web/                → Frontend React (deploy no Vercel)
    api/
      whatsapp-proxy/   → Serverless proxy (Vercel Functions) — desativado, frontend conecta direto no Render
    src/
      features/         → Paginas por feature (agenda, auth, patients, settings)
      lib/
        supabase/       → services.ts (toda comunicacao com Supabase), types.ts, client.ts
        utils/          → crypto.ts (criptografia AES-256-GCM), format.ts, patient.ts, etc.
      components/       → Componentes reutilizaveis (SectionCard, StatusBadge, ThemeToggle)
  whatsapp/            → Servico WhatsApp (deploy no Render)
    src/
      whatsapp/         → WhatsAppConnectionManager.ts (Baileys), useSupabaseAuthState.ts
      lib/              → repository.ts, messages.ts, phone.ts, supabase.ts, types.ts
      scheduler/        → reminderScheduler.ts (cron de lembretes automaticos)
      server/           → createServer.ts (Express API com CORS e JWT)
supabase/
  migrations/          → Migrations SQL numeradas (0001 a 0017)
```

## Como rodar localmente

1. Node.js 20+. Na raiz: `npm install`.
2. Copie `.env.example` para `apps/web/.env.local` e preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Copie `apps/whatsapp/.env.example` para `apps/whatsapp/.env` e preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Rode todas as migrations de `supabase/migrations/` no SQL Editor do Supabase (em ordem numerica).
5. `npm run dev:web` para o frontend. `npm run dev:whatsapp` para o bot.

---

# Diario de Alteracoes

## 2026-05-12 — Auditoria de Seguranca

Varredura completa identificou 22 vulnerabilidades (3 criticas, 11 altas, 8 medias). Todas corrigidas abaixo.

### 1. Bug critico da Agenda (conflito de horarios)
- **Arquivo**: `apps/web/src/features/agenda/AgendaPage.tsx` (funcao `persistSchedule`)
- **Problema**: Ao criar sessao em horario conflitante, cancelava TODAS as sessoes do paciente e podia desativar o paciente inteiro
- **Correcao**: Cancela apenas sessoes que realmente conflitam. So desativa paciente se usuario clicar "Substituir e inativar antigo"

### 2. Cadastro rapido duplicava pacientes
- **Arquivo**: `apps/web/src/features/agenda/AgendaPage.tsx` (funcao `handleQuickPatientSubmit`)
- **Correcao**: Verifica nome duplicado entre pacientes ativos antes de criar

### 3. Bug financeiro series_id null
- **Arquivo**: `apps/web/src/lib/supabase/services.ts` (funcao `syncSupabasePaymentForSession`)
- **Problema**: `.eq("series_id", session.seriesId ?? "")` — no Postgres, null != string vazia
- **Correcao**: Usa `.is("series_id", null)` quando seriesId e nulo

### 4. Credenciais pre-preenchidas no login
- **Arquivo**: `apps/web/src/features/auth/LoginPage.tsx`
- **Correcao**: Campos iniciam vazios (antes: `psicologa@consultorio.com` / `123456`)

### 5. Upload sem sanitizacao de nome
- **Arquivo**: `apps/web/src/lib/supabase/services.ts` (funcao `uploadReceipt`)
- **Correcao**: Funcao `sanitizeFileName` limpa caracteres especiais e limita a 100 chars

### 6. Proxy WhatsApp vulneravel
- **Arquivo**: `apps/web/api/whatsapp-proxy/[...path].js`
- **Correcao**: Allowlist de paths, Bearer token obrigatorio, body limitado a 64KB, normaliza paths contra traversal

### 7. Anamnese publica permitia reenvio
- **Migration**: `0016_security_hardening.sql`
- **Correcao**: `share_token` e apagado apos submissao. Bloqueada leitura/escrita quando status = `completed`

### 8. Sem controle de role em RPCs
- **Migration**: `0016_security_hardening.sql`
- **Correcao**: `update_current_app_settings` exige role `owner`. `delete_patient` exige `owner` ou `admin`

### 9. Criptografia de dados sensiveis (LGPD)
- **Arquivo novo**: `apps/web/src/lib/utils/crypto.ts`
- **Modificado**: `apps/web/src/lib/supabase/services.ts`
- **Algoritmo**: AES-256-GCM via Web Crypto API
- **Campos criptografados**: `medical_records.private_notes`, `medical_records.clinical_summary`, `patients.notes`
- **Ativacao**: Definir `VITE_ENCRYPTION_KEY` (32+ caracteres) nas variaveis de ambiente
- **Retrocompativel**: Dados sem prefixo `enc:` continuam legiveis

### 10. WhatsApp CORS e payload
- `apps/whatsapp/src/config.ts` — `allowFileOrigin` mudado para `false`
- `apps/whatsapp/src/server/createServer.ts` — JSON body limitado a 64KB

---

## 2026-05-12 — Migracao WhatsApp: whatsapp-web.js → Baileys

### Motivacao
`whatsapp-web.js` usa Puppeteer (Chrome headless, ~500MB RAM). Nao roda em plataformas gratuitas. Baileys conecta via WebSocket direto ao WhatsApp (~50MB RAM).

### Arquivos alterados
- **Reescrito**: `apps/whatsapp/src/whatsapp/WhatsAppConnectionManager.ts` — toda logica migrada pra Baileys
- **Novo**: `apps/whatsapp/src/whatsapp/useSupabaseAuthState.ts` — salva sessao no Supabase (tabela `whatsapp_auth_keys`) ao inves do filesystem
- **Atualizado**: `apps/whatsapp/package.json` — removido `whatsapp-web.js`, adicionado `baileys`, `@hapi/boom`, `pino`
- **Atualizado**: `apps/whatsapp/src/config.ts` — removidas configs Puppeteer (`headless`, `browserPath`, `authDir`)
- **Novo**: `apps/whatsapp/Dockerfile`
- **Nova migration**: `0017_whatsapp_auth_keys_and_keepalive.sql`

### O que nao mudou
Frontend, mensagens, scheduler, repository, server Express — tudo igual. A troca e transparente pro usuario.

---

## 2026-05-12 — Deploy em Producao

### Vercel (frontend)
- Variaveis de ambiente:
  - `VITE_SUPABASE_URL` = `https://qsbtmnsibxrnecynmhdp.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = *(chave anon)*
  - `VITE_WHATSAPP_SERVICE_URL` = `https://clinplanner-whatsapp.onrender.com`
  - `WHATSAPP_SERVICE_BASE_URL` = `https://clinplanner-whatsapp.onrender.com`

### Render (WhatsApp bot)
- Root Directory: `apps/whatsapp`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Variaveis de ambiente:
  - `SUPABASE_URL` = `https://qsbtmnsibxrnecynmhdp.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` = *(chave service_role)*
  - `WHATSAPP_ALLOWED_ORIGINS` = `https://clinplanner.vercel.app`

### Supabase
- Extensoes ativadas: `pgcrypto`, `pg_cron`, `pg_net`
- Cron ativo: `keep-whatsapp-alive` — pinga Render a cada 10 min pra impedir spin-down

```sql
select cron.schedule('keep-whatsapp-alive', '*/10 * * * *',
  $$select net.http_get('https://clinplanner-whatsapp.onrender.com/health')$$);
```

### Migrations executadas
- `0016_security_hardening.sql` — RPCs hardened (anamnese, settings, delete_patient)
- `0017_whatsapp_auth_keys_and_keepalive.sql` — Tabela `whatsapp_auth_keys` + extensoes pg_cron/pg_net

---

## 2026-05-14 — Auditoria Financeira, Logo por Tema e Layout Mobile

- **Financeiro**: corrigido sincronismo de pagamentos (series_id null, status overdue, lógica de quitação)
- **Logo**: logo troca automaticamente entre claro/escuro via `data-theme` no `<html>`
- **Mobile**: layout responsivo corrigido em AgendaPage, FinancePage e PatientsPage

---

## 2026-05-27 — Redesenho da Agenda

Interface da agenda substituída por day picker + timeline diária:

- **Day picker horizontal**: 7 dias com navegação por semana, dot indicador de sessões
- **Timeline diária**: itens expansíveis com ações inline (confirmar, cancelar, marcar como realizado)
- **KPI cards**: totais da semana (sessões ativas, confirmadas, aguardando confirmação)
- **Arquivo**: `apps/web/src/features/agenda/AgendaPage.tsx` (reescrito), `apps/web/src/styles/theme.css`

---

## 2026-05-27 — Fix WhatsApp: QR Code não aparecia após logout

- **Problema**: ao fazer logout da sessão (WhatsApp encerrado pelo usuário), as credenciais inválidas ficavam salvas na tabela `whatsapp_auth_keys`. Na próxima tentativa de conectar, o Baileys recarregava essas credenciais, recebia imediatamente outro `loggedOut`, e o QR code nunca era gerado.
- **Correção**: `clearSupabaseAuthState()` chamada no handler de `DisconnectReason.loggedOut` — limpa todas as chaves do tenant antes de marcar como desconectado.
- **Arquivos**: `apps/whatsapp/src/whatsapp/useSupabaseAuthState.ts`, `WhatsAppConnectionManager.ts`

## 2026-05-27 — Configuração de Produção do WhatsApp corrigida

- `WHATSAPP_SERVICE_BASE_URL` adicionado ao ambiente Production no Vercel (antes só estava em Preview)
- Frontend em produção agora roteia corretamente pelo proxy `/api/whatsapp-proxy` → Render

---

## Pendencias conhecidas

- [ ] Ativar criptografia: configurar `VITE_ENCRYPTION_KEY` no Vercel (32+ caracteres)
- [ ] Testar fluxo completo WhatsApp em producao: conectar QR, enviar lembrete, receber resposta
- [ ] Considerar rate limiting nas RPCs publicas da anamnese
- [ ] VM GCP `clingestor-whatsapp` (34.69.45.21) pode ser desativada — servico migrado para Render

---

*Ultima atualizacao: 2026-05-27*
