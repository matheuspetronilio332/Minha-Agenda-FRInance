# MinhaAgenda v2 — SaaS de agenda e gestão para autônomos

Sistema web responsivo (celular + computador), instalável como app (PWA). **Sem dependências**: só precisa do Node.js 18+.

## Como rodar
- Windows: dê dois cliques em `iniciar.bat` · Linux/Mac: `./iniciar.sh` · ou `node server.js`
- Abra http://localhost:3000 e crie sua conta.
- Outra porta: `PORT=8080 node server.js` · outra pasta de dados: `DATA_DIR=/caminho node server.js`
- No celular, abra o endereço do computador na mesma rede (ex.: http://192.168.0.10:3000) e use "Adicionar à tela inicial".

## Funcionalidades
- **Início**: resumo do dia, próximo atendimento, recebido/a receber no mês, aviso de pedidos online pendentes
- **Agenda**: faixa semanal, criar/editar/excluir, confirmar, concluir, receber (Pix/Dinheiro/Cartão/Transferência), aviso de conflito de horário, lembrete por WhatsApp
- **Clientes** (busca + histórico) e **Serviços** (duração e preço, preenchem o agendamento automaticamente)
- **Financeiro**: recebido, a receber, despesas, lucro, gráfico de 6 meses, total por forma de pagamento, exportação CSV (abre no Excel)
- **Agendamento online**: link `/b/seu-negocio` com horários livres (respeita seu expediente e intervalo); pedidos chegam como "pendente"
- **Conta**: nome do negócio, ativar/desativar agendamento online, horário de atendimento, trocar senha

## Segurança e robustez (v2)
Validação de todos os dados no servidor, isolamento entre contas, sessões com validade de 30 dias, limite de tentativas de login, proteção contra acesso a arquivos fora de `public/`, cabeçalhos de segurança.

## Estrutura
`server.js` (API + arquivos estáticos) · `public/index.html` (interface) · `data/db.json` (banco, criado automaticamente — **faça backup**)

## Para produção
Use HTTPS (Nginx/Caddy como proxy) e faça backup de `data/`. Com muitos usuários, troque o JSON por SQLite/PostgreSQL. Ainda não incluídos: cobrança de assinatura, envio automático de e-mail/WhatsApp, recuperação de senha, assinatura digital do cliente.
