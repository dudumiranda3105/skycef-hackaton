# Caso de uso UML — recebimento inteligente

O diagrama [em SVG](caso-de-uso.svg) mostra as responsabilidades da solução. Os atores são papéis de operação; o projeto não implementa autenticação ou perfis.

## Atores e casos

| Ator | Casos de uso |
|---|---|
| Fornecedor | Criar agendamento com uma ou mais notas fiscais; solicitar cancelamento; solicitar reagendamento |
| Compras | Conferir nota fiscal e pedido; autorizar ou recusar |
| Responsável do armazém | Definir destinos; registrar chegada, entrada, saída, chapas e equipamentos por descarga; efetivar cancelamento e decidir a vaga liberada; registrar não recebimento |
| Encarregado dos chapas | Lançar o boletim do dia com os 4 armazéns de uma vez; informar produção e equipe de cada armazém; conferir piso e complemento |
| Gestão | Consultar painel por período e armazém; analisar sobra ou falta em R$ e origem dos dados |

## Relações UML

- `Criar agendamento` inclui `Anexar nota(s) fiscal(is)` e `Validar capacidade global`.
- `Autorizar recebimento` inclui `Conferir NF × pedido`.
- `Registrar descarga` inclui `Registrar marcos e recursos`.
- `Fechar boletim` inclui `Calcular piso e complemento`.
- `Consultar painel` inclui `Analisar sobra/falta em R$`.
- `Reagendar por caso fortuito` e `Tratar cancelamento` estendem o fluxo normal do agendamento.

O caso de uso representa o processo proposto. Os status técnicos e as regras de cálculo estão em [`API-TAREFA1.md`](API-TAREFA1.md), [`API-TAREFA2.md`](API-TAREFA2.md) e [`API-TAREFA3.md`](API-TAREFA3.md).
