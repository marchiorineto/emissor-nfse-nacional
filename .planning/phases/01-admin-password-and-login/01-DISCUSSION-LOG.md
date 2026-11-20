# Phase 1: Admin Password and Login - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 01-admin-password-and-login
**Areas discussed:** Sessão e revogação, Limite de tentativas, Telas /login e /admin, Entrega do token CSRF

---

## Sessão e revogação

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela no SQLite | Cookie com id aleatório e tabela admin_sessions; o logout apaga a linha | |
| Cookie assinado sem estado | HMAC (expira em + assinatura), chave derivada do hash, sem tabela | ✓ |
| Você decide | — | |

| Option (troca de senha) | Description | Selected |
|--------|-------------|----------|
| Exige reiniciar | Igual ao `pnpm run certificate` | ✓ |
| Vale na hora | Relê o .env ou apaga as sessões no SQLite | |

| Option (expiração) | Description | Selected |
|--------|-------------|----------|
| 12 h fixas | Novo login depois de 12 h | ✓ |
| 12 h sem uso | Renova a cada chamada | |

| Option (sessão expirada) | Description | Selected |
|--------|-------------|----------|
| 401 JSON e o painel vai ao /login | As páginas /admin* redirecionam no servidor | ✓ |
| Você decide | — | |

| Option (logout) | Description | Selected |
|--------|-------------|----------|
| Apaga o cookie e revoga em memória | Lista de ids revogados até expirarem | |
| Só apaga o cookie | Uma cópia do cookie vale até as 12 h | ✓ |
| Logout encerra todas as sessões | Contador de geração na chave | |

| Option (conteúdo do cookie) | Description | Selected |
|--------|-------------|----------|
| Id aleatório + expiração, chave do hash | Trocar a senha e reiniciar invalida tudo | ✓ |
| Você decide | — | |

**User's choice:** Cookie sem estado; trocar a senha exige reiniciar; 12 h fixas; logout só apaga o cookie.

---

## Limite de tentativas

| Option | Description | Selected |
|--------|-------------|----------|
| Atraso crescente por IP | 1 s, 2 s, 4 s… até 30 s, em memória | ✓ |
| Bloqueio temporário | 429 depois de N falhas | |
| Você decide | — | |

| Option (IP real) | Description | Selected |
|--------|-------------|----------|
| X-Forwarded-For só com opção | TRUST_PROXY=1 | |
| Sempre o IP da conexão | Sem variável nova | |
| Sempre X-Forwarded-For | Simples, mas forjável sem proxy | ✓ |

| Option (entrada do XFF) | Description | Selected |
|--------|-------------|----------|
| Última entrada, ou IP da conexão | A que o proxy mais próximo acrescenta | ✓ |
| Primeira entrada | O cliente pode forjar | |
| Você decide | — | |

| Option (global) | Description | Selected |
|--------|-------------|----------|
| Não, só por IP | — | ✓ |
| Sim, um teto global leve | Uma verificação scrypt por vez | |

**User's choice:** Atraso crescente por IP, com a última entrada do XFF ou o IP da conexão; sem limite global.

---

## Telas /login e /admin

| Option | Description | Selected |
|--------|-------------|----------|
| Esqueleto do painel | Cabeçalho, ambiente, Sair e área vazia | ✓ |
| Página mínima | "Você está conectado" e Sair | |

| Option (HTML) | Description | Selected |
|--------|-------------|----------|
| Templates html`` do Hono | Gerados no servidor e escapados | ✓ |
| Arquivos estáticos em public/ | serveStatic | |
| Você decide | — | |

| Option (estilo) | Description | Selected |
|--------|-------------|----------|
| CSS próprio embutido | Sem CDN | |
| CSS sem classes de uma CDN | Pico.css/Water.css | ✓ |
| Você decide | — | |

| Option (lib) | Description | Selected |
|--------|-------------|----------|
| Pico.css | jsDelivr com versão fixa e SRI | ✓ |
| Water.css | — | |
| Você decide | — | |

| Option (sem CDN) | Description | Selected |
|--------|-------------|----------|
| Aceita sem estilo | — | ✓ |
| Vendorizar o arquivo no repo | — | |

| Option (formulário de login) | Description | Selected |
|--------|-------------|----------|
| Form POST clássico | 303 para /admin; volta com erro | ✓ |
| fetch com JS | — | |

| Option (sair) | Description | Selected |
|--------|-------------|----------|
| POST /logout → /login | Com o token CSRF | ✓ |
| GET /logout | — | |

**User's choice:** Esqueleto do painel com `html` do Hono, Pico.css da CDN (sem fallback), login por formulário POST e logout por POST.

---

## Entrega do token CSRF

| Option | Description | Selected |
|--------|-------------|----------|
| Derivado da sessão, na página | HMAC(chave, id), na meta e no cabeçalho X-CSRF-Token | ✓ |
| Double-submit cookie | — | |
| Você decide | — | |

| Option (CSRF no login) | Description | Selected |
|--------|-------------|----------|
| Checar Origin/Sec-Fetch-Site | — | ✓ |
| Não precisa | — | |

| Option (alcance) | Description | Selected |
|--------|-------------|----------|
| /v1 e /health | O mesmo alcance do Bearer | ✓ |
| Só /v1 | — | |

| Option (prioridade) | Description | Selected |
|--------|-------------|----------|
| Bearer primeiro, sem CSRF | O cookie só entra sem Authorization | ✓ |
| Você decide | — | |

**User's choice:** Token CSRF derivado da sessão, checagem de Origin no login, sessão em /v1 e /health, Bearer com prioridade.

---

## Claude's Discretion

- O formato do hash e os parâmetros do scrypt
- A curva do atraso, a janela para zerar o contador e a limpeza da memória
- Esperar antes de responder ou responder 429
- O nome do cookie e a detecção de HTTPS
- A divisão do código em módulos
- O comportamento do script sem TTY

## Deferred Ideas

Nenhuma.
