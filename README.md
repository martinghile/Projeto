# ClinPlanner

Base inicial de um SaaS para psicologos com:

- `React` para a interface web responsiva
- `Electron` para o aplicativo desktop
- `Supabase` para Auth, PostgreSQL, Storage e API
- `whatsapp-web.js` para lembretes automaticos via WhatsApp Web com QR Code

## Estrutura

```text
.
|- apps/
|  |- desktop/   # shell Electron
|  |- web/       # frontend React + Vite
|  \- whatsapp/  # servico Node para QR Code, scheduler e mensagens
|- docs/
|  \- architecture.md
|- supabase/
|  \- migrations/
|     |- 0001_initial_schema.sql
|     |- 0006_session_series.sql
|     \- 0007_whatsapp_automation.sql
|- .env.example
\- package.json
```

## Como rodar localmente

1. Instale Node.js 20 ou superior.
2. Na raiz do projeto, rode `npm install`.
3. Copie `.env.example` para `apps/web/.env.local`.
4. Preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_WHATSAPP_SERVICE_URL`.
5. Copie `apps/whatsapp/.env.example` para `apps/whatsapp/.env`.
6. Preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ALLOWED_ORIGINS` e os demais parametros do servico.
7. Execute no SQL Editor do Supabase todas as migrations da pasta [supabase/migrations](/Users/alessandro/dev/ClinGestor/supabase/migrations) em ordem numerica.
8. Rode `npm run dev:web` para a versao web responsiva.
9. Rode `npm run dev:desktop` para abrir o app Electron apontando para a web local.
10. Rode `npm run dev:whatsapp` para subir o servico de QR Code, cron e leitura de mensagens.
11. Se quiser a interface e o desktop juntos, rode `npm run dev`.

## Fluxo recomendado no Supabase

1. Crie um projeto.
2. Ative Email/Password em `Authentication`.
3. Execute todas as migrations da pasta `supabase/migrations`.
4. Crie um usuario pelo painel do Supabase Auth ou pela tela de login.
5. Configure o bucket privado `payment-receipts` se a migration ainda nao o tiver criado.
6. Em `Configuracoes`, abra a secao `WhatsApp`, clique em `Conectar WhatsApp` e escaneie o QR Code com o numero da clinica.
7. Deixe o servico `apps/whatsapp` em execucao para processar os lembretes a cada minuto.

## Documentacao

- Arquitetura completa: [docs/architecture.md](/Users/alessandro/dev/ClinGestor/docs/architecture.md)
- Deploy em nuvem: [docs/cloud-deployment.md](/Users/alessandro/dev/ClinGestor/docs/cloud-deployment.md)
- Privacidade e LGPD: [docs/privacy-and-lgpd.md](/Users/alessandro/dev/ClinGestor/docs/privacy-and-lgpd.md)
- Schema inicial: [supabase/migrations/0001_initial_schema.sql](/Users/alessandro/dev/ClinGestor/supabase/migrations/0001_initial_schema.sql)
- RPC publica da anamnese: [supabase/migrations/0002_public_anamnesis_rpc.sql](/Users/alessandro/dev/ClinGestor/supabase/migrations/0002_public_anamnesis_rpc.sql)
- Serie semanal da agenda: [supabase/migrations/0006_session_series.sql](/Users/alessandro/dev/ClinGestor/supabase/migrations/0006_session_series.sql)
- Automacao do WhatsApp: [supabase/migrations/0007_whatsapp_automation.sql](/Users/alessandro/dev/ClinGestor/supabase/migrations/0007_whatsapp_automation.sql)

## Como operar em nuvem

Para instalar o mesmo sistema em varias maquinas:

1. Mantenha o `Supabase` como backend central.
2. Publique o servico `apps/whatsapp` em um servidor unico, com disco persistente para a sessao do WhatsApp.
3. Gere o instalador com `apps/web/.env.production` apontando para o `Supabase` e para a URL publica do servico WhatsApp.

O passo a passo detalhado esta em [docs/cloud-deployment.md](/Users/alessandro/dev/ClinGestor/docs/cloud-deployment.md).

## Publicacao na Vercel

Para publicar a versao web na Vercel:

1. Suba este repositorio para o GitHub.
2. Importe o repositorio na Vercel.
3. Em `Root Directory`, selecione `apps/web`.
4. Configure as variaveis de ambiente do frontend na Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_WHATSAPP_SERVICE_URL=/whatsapp-proxy`
   - `WHATSAPP_SERVICE_BASE_URL=https://whatsapp.seudominio.com`
5. Faca o deploy.

O arquivo [vercel.json](/Users/alessandro/dev/ClinGestor/apps/web/vercel.json) ja configura:
- rewrite SPA para o React Router
- proxy interno do WhatsApp em `/whatsapp-proxy/*` sem expor a URL da infraestrutura no frontend
