# ClinGestor em Nuvem

## Objetivo

Deixar o `ClinGestor` acessivel em varias maquinas instaladas, sem depender de banco local nem de um servico de WhatsApp rodando em cada computador.

## Arquitetura recomendada

```text
Maquinas com instalador do ClinGestor
        |
        | HTTPS
        v
Frontend web publicado (opcional para navegador/mobile)
        |
        +--------------------------+
        |                          |
        v                          v
Supabase                    Servico central WhatsApp
(Auth, Postgres,            (QR Code, scheduler e respostas)
Storage e API)              apps/whatsapp
```

## O que precisa ficar na nuvem

1. `Supabase`
   Banco, autenticacao, storage e API ja ficam centralizados nele.

2. `apps/whatsapp`
   O servico de lembretes precisa rodar em um servidor unico, com disco persistente para a pasta `.wwebjs_auth`.

3. `apps/web` (opcional)
   So precisa ser publicado se voce quiser usar o sistema direto pelo navegador ou pelo celular. O instalador Electron continua funcionando com o frontend empacotado.

## Variaveis de producao

### Frontend web

Use [apps/web/.env.production.example](/Users/alessandro/dev/ClinGestor/apps/web/.env.production.example) como base para `apps/web/.env.production`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_WHATSAPP_SERVICE_URL=https://whatsapp.seudominio.com
```

### Servico do WhatsApp

Use [apps/whatsapp/.env.production.example](/Users/alessandro/dev/ClinGestor/apps/whatsapp/.env.production.example) como base para `apps/whatsapp/.env.production`:

```env
PORT=4100
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WHATSAPP_ALLOWED_ORIGINS=https://app.seudominio.com
WHATSAPP_AUTH_DIR=/var/lib/clingestor-whatsapp/.wwebjs_auth
WHATSAPP_DEFAULT_COUNTRY_CODE=55
WHATSAPP_REMINDER_CRON=* * * * *
WHATSAPP_HEADLESS=true
WHATSAPP_BROWSER_PATH=
```

## Publicacao do frontend

1. Crie `apps/web/.env.production`.
2. Gere o build:

```bash
npm run build:web
```

3. Publique a pasta `apps/web/dist` em um host de arquivos estaticos.

## Publicacao do servico WhatsApp

1. No servidor, copie o projeto ou pelo menos a pasta `apps/whatsapp`.
2. Crie `apps/whatsapp/.env.production`.
3. Gere o build:

```bash
npm --workspace apps/whatsapp run build
```

4. Inicie com PM2 usando [ecosystem.config.cjs](/Users/alessandro/dev/ClinGestor/apps/whatsapp/ecosystem.config.cjs):

```bash
pm2 start apps/whatsapp/ecosystem.config.cjs
pm2 save
```

5. Exponha o servico por HTTPS em um dominio como `https://whatsapp.seudominio.com`.

## Geracao do instalador para outras maquinas

1. Configure o frontend com as URLs de producao em `apps/web/.env.production`.
2. Gere o build web:

```bash
npm run build:web
```

3. Gere o instalador do desktop:

```bash
npm run build:desktop
```

4. Distribua o `.exe` gerado em `Instalador/`.

Quando o instalador abrir em outra maquina, ele vai usar:

- o Supabase em nuvem
- o servico central do WhatsApp em nuvem
- o frontend empacotado no proprio instalador

## Checklist de producao

- `Supabase` configurado e acessivel
- migrations aplicadas
- `apps/web/.env.production` preenchido
- `apps/whatsapp/.env.production` preenchido
- pasta de auth do WhatsApp em disco persistente
- somente uma instancia do servico WhatsApp ativa
- dominio HTTPS do frontend e do servico WhatsApp funcionando
