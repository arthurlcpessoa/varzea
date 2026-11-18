# Várzea ⚽

Plataforma de gestão de futebol amador — **Equipe 5 · CESAR School · Projetos 4 · 2026.2**.

A Várzea tira do organizador da pelada o trabalho operacional: confirmação de presença, cobrança e conferência de Pix, montagem de times e acompanhamento da partida. É composta por um **painel web** (responsivo, celular e computador) e pelo **PELA-BOT / VarzIA**, assistente que conversa com os jogadores pelo WhatsApp.

O visual do painel parte do protótipo feito no Figma Make; as regras seguem a *Documentação de Requisitos v1.0*.

## Como rodar

Requisitos: **Node.js 20+** e npm.

```bash
cp server/.env.example server/.env
npm run setup      # instala dependências, cria o banco SQLite e popula com dados de exemplo
npm run dev        # API em http://localhost:3333 · painel em http://localhost:5173
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe API e painel com recarga automática |
| `npm test` | Roda os testes da API (Vitest + Supertest, banco descartável) |
| `npm run build` | Compila API (`server/dist`) e painel (`web/dist`) |
| `npm run typecheck` | Checagem de tipos dos dois projetos |
| `npm run db:seed -w server` | Recria os dados de demonstração |

**Produção:** depois do `npm run build`, rode `NODE_ENV=production node server/dist/index.js`. A API passa a servir também o painel compilado, então um único serviço basta. Defina `JWT_SECRET` e, para Postgres, troque o `provider` em `server/prisma/schema.prisma` e a `DATABASE_URL`.

## Estrutura

```
server/                 API Node.js (Express 5 + Prisma + Zod)
  prisma/schema.prisma  modelo de dados
  prisma/seed.ts        dados de demonstração
  src/routes/           auth, clubes, partidas, webhook do bot
  src/services/         presença/lista de espera, pagamentos, sorteio, bot, tempo real
  src/services/pix/     BR Code (Pix copia e cola) + interface de provedor Pix
  src/services/whatsapp interface de provedor de WhatsApp
  src/lib/domain.ts     papéis e matriz de permissões
  test/                 testes automatizados
web/                    Painel React 19 + Vite + React Router
  src/pages/            telas (login/cadastro, início, partidas, ao vivo, clube, bot, perfil)
  src/components/       shell, ícones, componentes de interface
  src/lib/              cliente da API, sessão, formatação
```

## O que já funciona

| Área | Requisitos | Onde |
| --- | --- | --- |
| Cadastro, login, sair, recuperar senha | RF01–RF04, RN01, RN02, RNF05 | `routes/auth.ts`, `pages/Auth.tsx` |
| Criar clube, convidar por link/código, vários clubes por usuário | RF05–RF10, RN03, RN04 | `routes/clubs.ts`, `pages/Club.tsx` |
| Elenco: nome, apelido, telefone, posição, goleiro, nível técnico, função | RF11–RF14, RN06, RN07 | `routes/clubs.ts`, `pages/Club.tsx` |
| Permissões por função e isolamento entre clubes | RF15, RN05, RN19, RNF06 | `lib/domain.ts`, `middleware/auth.ts` |
| Remoção do clube sem apagar a conta | RF13, RN20 | `routes/clubs.ts` |
| Partidas: criar, editar, cancelar, vagas, valor | RF16–RF20, RN09 | `routes/matches.ts`, `pages/Matches.tsx` |
| Presença com lista de espera e promoção automática | RF19, RF21, RN10 | `services/attendance.ts` |
| Pix copia e cola por jogador, conferência e histórico | RF27–RF32, RN11, RN12 | `services/payments.ts`, `services/pix/` |
| Sorteio equilibrado (goleiros, posições, nível) e ajuste manual | RF33–RF36, RN13, RN14 | `services/teamDraw.ts` |
| Jogo ao vivo: cronômetro, pausa, tempos, gols e assistências | RF37–RF42, RN15, RN16 | `routes/matches.ts`, `pages/Live.tsx` |
| Atualização em tempo real para quem acompanha (SSE) | RF45, RNF11 | `services/realtime.ts` |
| Estatísticas: artilharia, assistências, jogos, resultados | RF43, RF44, RN18 | `routes/clubs.ts` |
| Mural da partida e avisos do clube | RF46, RF47 | `routes/matches.ts`, `routes/clubs.ts` |
| VarzIA: convite, confirmação, Pix, lista, lembrete de pagamento | RF22–RF28 | `services/bot/engine.ts`, `pages/Bot.tsx` |
| Painel responsivo (celular, tablet, computador) | RNF03, RNF04 | `web/src/index.css` |

## Decisões tomadas para os pontos pendentes

A seção 7 da documentação lista decisões em aberto. Para o sistema funcionar de ponta a ponta, adotei as opções abaixo — todas fáceis de mudar e marcadas no código. **Vale validar com a equipe.**

| # | Ponto pendente | Decisão inicial | Onde mudar |
| --- | --- | --- | --- |
| 1 | Campos obrigatórios | Nome, e-mail e senha (8+). Telefone e apelido opcionais (o telefone é o que liga o jogador ao bot). | `routes/auth.ts` |
| 2 | Mais de um clube? | Sim — o usuário pode criar e participar de vários clubes. | `routes/clubs.ts` |
| 3 | Permissões | Diretoria faz tudo. Comissão gerencia partidas, presença, pagamentos, times, bot e edita jogadores, mas **não** altera o clube, atribui funções ou remove pessoas. Jogador visualiza e cuida da própria presença. Telefones só aparecem para quem gerencia (LGPD). | `lib/domain.ts` |
| 4 | Identificar Pix automaticamente | Pix copia e cola com valor e `txid` por jogador, gerado a partir da chave do clube (sem taxa). A conferência é **manual** no painel por enquanto; a interface `PixProvider` está pronta para plugar um PSP com consulta automática. | `services/pix/provider.ts` |
| 5 | Integração com WhatsApp | Lógica do bot independente do provedor + webhook `POST /api/bot/webhook/:clubId`. Hoje roda em **modo simulado** (simulador no painel). Para produção, basta implementar `WhatsAppProvider` (Cloud API oficial, Z-API, Evolution API…). | `services/whatsapp/provider.ts` |
| 6 | Desistências | Partida cheia → lista de espera; quem desiste libera a vaga e o primeiro da espera é promovido e avisado (configurável no bot). Pagamento já feito fica no histórico. | `services/attendance.ts` |
| 7 | Critério do sorteio | Goleiros separados primeiro, depois por posição; dentro de cada posição, equilíbrio pela soma do nível técnico (1–5, visível só para a organização). | `services/teamDraw.ts` |
| 8 | Cronômetro/gols no MVP? | Implementado (era "evolução"), pois já estava no protótipo. | — |
| 9 | Indicadores iniciais | Gols, assistências e jogos por jogador; placar das partidas encerradas. | `routes/clubs.ts` |
| 10 | Chat | Mural da partida no painel; a conversa principal continua no WhatsApp via bot. | `routes/matches.ts` |

## Próximos passos sugeridos

1. **WhatsApp real:** escolher o provedor e implementar `WhatsAppProvider` + adaptador do webhook. Os disparos automáticos (convite X horas antes, cobrança Y horas antes) já têm configuração salva e precisam de um agendador (ex.: `node-cron`).
2. **Pix automático:** implementar `PixProvider.checkCharge` com o PSP escolhido. O botão de sincronizar (`POST /matches/:id/payments/sync`) já existe na API.
3. **E-mail:** enviar o link de recuperação de senha. Em desenvolvimento o link aparece na própria tela.
4. **Banco em produção:** migrar para Postgres e passar a usar `prisma migrate` em vez de `db push`.
5. **Fora do MVP (seção 6.2):** encontrar peladas, busca por árbitros, goleiros e campos, funcionalidades sociais.

## API em resumo

Todas as rotas ficam sob `/api` e, exceto login/cadastro/webhook, exigem `Authorization: Bearer <token>`.

- `POST /auth/register` · `POST /auth/login` · `POST /auth/forgot` · `POST /auth/reset` · `GET|PATCH /auth/me`
- `GET|POST /clubs` · `POST /clubs/join` · `GET|PATCH /clubs/:id`
- `GET|POST /clubs/:id/members` · `PATCH|DELETE /clubs/:id/members/:memberId` · `POST /clubs/:id/invites`
- `GET|POST /clubs/:id/matches` · `GET /clubs/:id/stats` · `GET /clubs/:id/finance` · `GET /clubs/:id/activity`
- `GET|POST /clubs/:id/announcements` · `GET|PUT /clubs/:id/bot` · `GET /clubs/:id/bot/messages` · `POST /clubs/:id/bot/simulate`
- `GET|PATCH /matches/:id` · `POST /matches/:id/cancel` · `POST /matches/:id/attendance` · `PUT /matches/:id/attendance/:memberId`
- `POST /matches/:id/teams/draw` · `PUT /matches/:id/teams/:memberId`
- `POST /matches/:id/payment/charge` · `POST /matches/:id/payments/:participantId/{confirm|revert|exempt}` · `POST /matches/:id/payments/sync`
- `POST /matches/:id/live/{start|pause|period|finish}` · `POST /matches/:id/events` · `DELETE /matches/:id/events/:eventId` · `GET /matches/:id/stream` (SSE)
- `GET|POST /matches/:id/wall` · `POST /matches/:id/broadcast`
- `POST /bot/webhook/:clubId` — entrada de mensagens do WhatsApp (`{ from, text }`)
