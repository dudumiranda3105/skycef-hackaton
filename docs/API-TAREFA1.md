# API da Tarefa 1 — Agendamento e recebimento

Base: `http://localhost:8000` · Swagger interativo em `/docs` · JSON em **camelCase** · horários `HH:MM` ·
instantes em ISO 8601 **com fuso** (`2026-10-05T13:30:00-03:00`). Sem `ocorridoEm`, vale o relógio do servidor
(fuso de São Paulo).

## O fluxo

```
Fornecedor                Compras                    Armazém                     Portaria/Armazém
──────────                ───────                    ───────                     ────────────────
POST /agendamentos  ─►  PENDENTE_COMPRAS
  (1+ notas, data, horário,
   acondicionamento)
POST .../notas/{id}/arquivo   (anexa PDF/XML)
                         POST .../validacao-compras
                           AUTORIZADO ─────────────►  AUTORIZADO
                           NAO_AUTORIZADO ─► fim (vaga e NF liberadas; entra em não recebimentos)
                                                       POST .../destinos  (1..4 armazéns)
                                                         └─ cria UMA descarga por armazém
                                                                                   POST .../chegada        (marco 1)
                                                                                   POST /descargas/{id}/entrada (marco 2) ─► EM_DESCARGA
                                                                                   POST /descargas/{id}/saida   (marco 3)
                                                                                     └─ última saída ─► CONCLUIDO
Desvios:  cancelamento (solicita → efetiva → vaga liberada) · reagendamento · não recebimento
```

A chegada do caminhão pode ser registrada **antes** da autorização (caminhão sem aviso): ela é copiada para as
descargas quando os destinos são definidos, e o tempo de espera é `entrada − chegada`.

## Status do agendamento

| Valor | Rótulo exibido (`statusRotulo`) |
|---|---|
| `PENDENTE_COMPRAS` | Aguardando Compras |
| `AUTORIZADO` | Autorizado |
| `NAO_AUTORIZADO` | Não autorizado |
| `EM_DESCARGA` | Descarregando |
| `CONCLUIDO` | Concluído |
| `CANCELADO` | Cancelado |
| `NAO_RECEBIDO` | Não recebido |

`NAO_AUTORIZADO`, `CANCELADO` e `NAO_RECEBIDO` liberam a vaga do horário e as notas fiscais.

## Regras que a API aplica

- **Horários:** 08:00, 10:00, 13:00, 15:00. Só segunda a sexta, fora de feriados (`data_nao_operacional`).
- **Vagas** (cooperativa inteira, por data+horário): carga `BATIDO` reserva o horário só para ela; sem batido,
  até 2 `PALETIZADO`/`BIG_BAG`. Reserva sob trava, então dois fornecedores simultâneos não estouram o limite.
- **Nota fiscal:** a mesma NF-e (chave de 44 dígitos) não pode estar ativa em dois agendamentos.
  Anexo: `.pdf` ou `.xml`, até 10 MB. No XML, a chave informada é conferida e chave/número/peso faltantes são preenchidos.
- **Entrada** exige agendamento autorizado por Compras e chegada registrada. **Saída** exige `quantidadeChapas`
  (por descarga; **nunca somar ao longo do dia**) e aceita `equipamentoIds`.
- **Cancelamento:** duas etapas (solicitar → efetivar). A vaga fica `ABERTA` e continua ocupada até o responsável do
  armazém **atribuí-la** a um agendamento ou **liberá-la** ao público. Nunca é automático.
- **Reagendamento:** guarda data/horário anteriores. Por `casoFortuito` (ex.: chuva) pode exceder o limite do horário.
- **Não recebimento:** motivos `DIVERGENCIA_NF_PEDIDO`, `SEM_AGENDAMENTO_SEM_VAGA`, `CASO_FORTUITO`, `OUTRO`
  (descrição obrigatória). Pode existir sem agendamento (informe `fornecedorId` ou `fornecedorNome`).

## Endpoints

| Método e rota | Corpo / parâmetros | Resposta |
|---|---|---|
| `GET /api/agenda?data=` | — | disponibilidade dos 4 horários (`diaUtil`, `slots[]`) |
| `GET /api/agendamentos?data=&status=` | filtros opcionais | lista de agendamentos |
| `POST /api/agendamentos` | `fornecedorId, data, horario, acondicionamento, notas[{nfChave?,nfNumero?,pesoTotalKg?}], agendadoNaHora?` | 201 agendamento |
| `GET /api/agendamentos/{id}` · `/eventos` | — | detalhe · trilha de auditoria |
| `POST /api/agendamentos/{id}/notas/{notaId}/arquivo` | multipart `arquivo` | agendamento |
| `GET /api/agendamentos/{id}/notas/{notaId}/arquivo` | — | o arquivo (download) |
| `POST /api/agendamentos/{id}/validacao-compras` | `decisao` (`AUTORIZADO`/`NAO_AUTORIZADO`), `pedidoReferencia` (se autorizar), `observacao` (se recusar) | agendamento |
| `POST /api/agendamentos/{id}/destinos` | `armazemIds[1..4], observacao?` | agendamento (com `descargas[]`) |
| `POST /api/agendamentos/{id}/chegada` | `ocorridoEm?` | agendamento |
| `POST /api/descargas/{id}/chegada` · `/entrada` | `ocorridoEm?` | agendamento |
| `POST /api/descargas/{id}/saida` | `quantidadeChapas`, `equipamentoIds?`, `ocorridoEm?` | agendamento |
| `POST /api/agendamentos/{id}/reagendamento` | `data, horario, motivo, casoFortuito?` | agendamento |
| `POST /api/agendamentos/{id}/cancelamento` · `/cancelamento/efetivacao` | `motivo` · — | agendamento |
| `GET /api/vagas-liberadas?situacao=` | `ABERTA`/`ATRIBUIDA`/`LIBERADA_GERAL` | vagas |
| `GET /api/vagas-liberadas/{id}/candidatos` | — | agendamentos que caberiam |
| `POST /api/vagas-liberadas/{id}/atribuicao` · `/liberacao-geral` | `agendamentoId` · — | agendamento · vaga |
| `POST /api/nao-recebimentos` · `GET` | `motivo, data?, agendamentoId?, fornecedorId?, fornecedorNome?, descricao?` | 201 registro · lista (`?data=&motivo=`) |
| `GET /api/fornecedores` · `POST` | `razaoSocial, cnpj?` | cadastro rápido |
| `GET /api/armazens` · `GET /api/equipamentos?armazemId=` | — | 4 armazéns · 19 equipamentos individuais |
| `GET /health` | — | `{"status":"ok"}` |

## Erros

Sempre `application/problem+json` com `status`, `detail` (texto para mostrar ao usuário) e `codigo` estável:

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `REQUISICAO_INVALIDA` | campo ausente/inválido (inclui `erros[]` com campo e mensagem) |
| 404 | `NAO_ENCONTRADO` | agendamento, descarga, vaga, nota ou fornecedor inexistente |
| 409 | `CONFLITO` | sem vaga, estado não permite, NF já agendada, duas pessoas agindo ao mesmo tempo |
| 413 | `ARQUIVO_MUITO_GRANDE` | anexo acima de 10 MB |
| 422 | `REGRA_DE_NEGOCIO` | fim de semana, horário inválido, ordem dos marcos, falta de chapas... |
| 500 | `ERRO_INTERNO` | inesperado (detalhe fica só no log do servidor) |
