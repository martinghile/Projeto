# Privacidade e LGPD

## Objetivo

Este documento resume a camada minima de privacidade e governanca recomendada para operar o `ClinPlanner` com dados pessoais e dados sensiveis relacionados a saude.

## Escopo de dados

O sistema pode tratar:

- cadastro de pacientes
- telefone, email, CPF e endereco
- agenda e historico de sessoes
- financeiro e comprovantes
- anamnese e prontuario clinico

## Salvaguardas tecnicas atuais

- autenticacao via Supabase Auth
- isolamento por tenant no banco
- RLS nas tabelas de negocio
- bucket privado para comprovantes
- link publico de anamnese com expiracao
- ocultacao do nome completo no fluxo publico da anamnese
- registro minimo de abertura do link publico da anamnese

## Medidas operacionais recomendadas

Para uso real com pacientes, a clinica responsavel deve manter:

1. politica de privacidade clara
2. definicao de base legal por fluxo de tratamento
3. prazo de retencao por categoria de dado
4. canal para direitos do titular
5. plano de resposta a incidente
6. revisao periodica de acessos e credenciais

## Direitos do titular

Em ambiente real, o controlador deve prever processo para:

- confirmar a existencia de tratamento
- corrigir dados incompletos ou desatualizados
- exportar dados quando cabivel
- eliminar dados quando houver base para isso
- informar compartilhamentos e finalidade

## Modo demonstracao

O modo demo do `ClinPlanner` usa somente dados ficticios e temporarios no navegador local. Esses dados nao devem ser usados para atendimento real.

## Pendencias externas ao codigo

- revisar historico do Git caso o repositorio ja tenha publicado detalhes antigos de infraestrutura
- manter service role e tokens somente em variaveis de ambiente
- publicar frontend e servico do WhatsApp em HTTPS
