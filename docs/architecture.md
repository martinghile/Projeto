# Arquitetura do sistema

## Objetivo

Entregar um sistema extremamente simples para a psicologa no dia a dia, sem sacrificar a evolucao para um SaaS multiempresa no futuro.

## Diretrizes de produto

- Interface com poucos elementos por tela
- Botoes grandes e linguagem direta
- Fluxos criticos com no maximo 2 ou 3 decisoes por etapa
- Dados clinicos e financeiros segregados com politicas de acesso por tenant

## Arquitetura de alto nivel

```text
React Web (Vite)
   |
   | Supabase JS
   v
Supabase
|- Auth
|- PostgreSQL
|  |- tabelas transacionais
|  |- RLS por tenant
|  \- funcoes auxiliares
|- Storage
|  \- comprovantes financeiros
\- Edge Functions
   \- lembretes de sessao por email

Electron
\- carrega o app web local/remoto em uma janela desktop
```

## Modelo SaaS

Mesmo com uma unica psicologa no inicio, o banco ja nasce preparado para multitenancy:

- `tenants`: representa a clinica/empresa dona dos dados
- `users`: perfil publico ligado ao `auth.users`
- todas as tabelas clinicas e financeiras carregam `tenant_id`
- RLS garante que um usuario autenticado so veja dados do proprio tenant

Essa modelagem evita retrabalho quando o produto passar de single-practice para SaaS.

## Modulos

### 1. Dashboard

- resumo do dia
- proximas sessoes
- cobrancas pendentes
- faturamento do mes

### 2. Agenda

- calendario semanal
- status da sessao
- remarcacao e cancelamento
- gancho para lembrete automatico 24h antes

### 3. Pacientes

- cadastro simples
- listagem com busca
- ficha com abas: Dados, Anamnese, Prontuario, Financeiro, Sessoes

### 4. Anamnese

- formulario clinico inicial em `jsonb`
- link compartilhavel por token
- status: rascunho, enviado, concluido

### 5. Prontuario

- anotacoes privadas por sessao
- separacao entre agenda e registro clinico

### 6. Financeiro

- valor por sessao
- pagamentos e pendencias
- comprovantes no Supabase Storage

### 7. Relatorios

- faturamento mensal
- pacientes ativos
- sessoes realizadas
- sessoes faltadas

### 8. Notificacoes

- tabela de lembretes agendados
- envio por Edge Function com cron

## Estrutura do frontend React

```text
apps/web/src
|- app/
|  |- App.tsx
|  |- AppShell.tsx
|  \- router.tsx
|- components/
|  |- KpiCard.tsx
|  |- SectionCard.tsx
|  \- StatusBadge.tsx
|- features/
|  |- agenda/
|  |- auth/
|  |- dashboard/
|  |- financial/
|  |- patients/
|  |- reports/
|  \- settings/
|- lib/
|  |- supabase/
|  |  |- client.ts
|  |  |- services.ts
|  |  \- types.ts
|  \- utils/
|     |- demoData.ts
|     \- format.ts
|- styles/
|  \- theme.css
\- main.tsx
```

## Decisoes tecnicas

### React + Vite

- setup enxuto
- otimo tempo de desenvolvimento
- facil empacotamento dentro do Electron

### Electron como shell

- reaproveita a mesma UI da web
- reduz duplicacao
- permite distribuir desktop para Windows/macOS

### Supabase como backend

- Auth pronto
- PostgreSQL gerenciado
- RLS nativa
- Storage com politicas
- API REST/Realtime gerada automaticamente

## Seguranca e privacidade

- RLS em todas as tabelas de negocio
- bucket privado para comprovantes
- `medical_records.private_notes` acessivel apenas a usuarios autenticados do tenant
- links publicos de anamnese com expiracao e identificacao reduzida no frontend publico
- registro minimo de abertura do link publico da anamnese
- modo demonstracao com dados ficticios e temporarios
- sugestao futura: logs de auditoria para leitura/edicao de prontuario e eventos administrativos

## Escalabilidade

- multitenancy por `tenant_id`
- camadas do frontend separadas por dominio
- Electron desacoplado do backend
- possibilidade futura de adicionar:
  - assinatura e billing
  - convites de equipe
  - RBAC mais detalhado
  - Edge Functions para notificacao e integracoes

## Lembrete automatico 24h antes

Arquitetura sugerida:

1. Um trigger ou job cria/atualiza uma linha em `session_reminders` ao criar/remarcar sessao.
2. Um cron do Supabase chama uma Edge Function a cada hora.
3. A Edge Function busca sessoes com `scheduled_for <= now()` e `status = pending`.
4. O email e enviado e o lembrete e marcado como `sent`.

## Evolucao recomendada

1. Fechar o MVP com cadastro, agenda, prontuario e financeiro.
2. Automatizar lembretes por email.
3. Adicionar onboarding e configuracoes por tenant.
4. Evoluir para equipe multiusuario dentro do mesmo tenant.
