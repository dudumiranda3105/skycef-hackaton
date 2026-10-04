# Caso de uso UML — recebimento inteligente

O diagrama [em SVG](caso-de-uso.svg) mostra as responsabilidades operacionais da solução; autenticação e perfis são tratados separadamente em [Login e perfis](API-LOGIN.md). Cada ator corresponde a um perfil da API (`auth/Permissoes.java`).

![Casos de uso UML](caso-de-uso.svg)

## Atores e casos

| Ator (perfil) | Casos de uso |
|---|---|
| Fornecedor (`FORNECEDOR`) | Criar agendamento com uma ou mais notas fiscais, acondicionamento, data e um dos 4 horários; pedir cancelamento ou reagendamento |
| Compras (`COMPRAS`) | Conferir nota fiscal × pedido de compra; autorizar ou recusar |
| Porteiro (`PORTEIRO`) | Ler o QR da entrega e conferir caminhão, placa, NFs e destinatário; registrar a chegada (hora do servidor); anexar os documentos das NFs e enviá-los a Insumos; registrar não recebimento de caminhão sem agendamento e sem vaga |
| Setor de Insumos (`INSUMO`) | Conferir os documentos enviados pela Portaria; verificar a autorização de Compras e direcionar a entrega para 1 a 4 armazéns (cria uma descarga por destino) ou recusar o recebimento com justificativa |
| Responsável do armazém (`ARMAZEM`) | Registrar entrada e saída de cada descarga, com a quantidade de chapas e os equipamentos usados; efetivar cancelamento e decidir quem ocupa a vaga liberada; reagendar por caso fortuito; registrar não recebimento |
| Encarregado dos chapas (`ENCARREGADO`) | Lançar o boletim do dia com os 4 armazéns de uma vez (produção e equipe de cada um); conferir piso e complemento |
| Diretoria (`DIRETORIA`) | Consultar o painel por período e armazém; analisar sobra ou falta de chapas em R$; fazer perguntas em texto livre em Pergunte aos Dados |

O perfil `ADMIN` pode executar todos os casos e não aparece como ator separado. A tela de Agenda também permite que Armazém e Portaria criem o agendamento na hora para um caminhão que chegou sem aviso, quando há vaga.

## Relações UML

- `Criar agendamento` inclui `Anexar NF e acondicionamento` e `Validar capacidade global` (carga batida ocupa o horário inteiro; sem batido, até 2 paletizados/big bags; limite da cooperativa inteira).
- `Autorizar recebimento` inclui `Conferir NF × pedido`.
- `Conferir caminhão via QR` inclui `Registrar chegada`. `Perder agenda (atraso ≥ 30 min)` estende `Registrar chegada`.
- `Validar e direcionar destinos` inclui `Criar descarga por destino`. `Recusar recebimento` estende `Validar e direcionar destinos` e inclui `Gravar não recebimento`.
- `Registrar entrada e saída` inclui `Informar chapas e equipamentos`. A quantidade de chapas é da descarga e não é somada ao longo do dia.
- `Lançar boletim do dia` inclui `Calcular piso e complemento`.
- `Consultar painel` inclui `Analisar sobra/falta em R$`.

## Origem das regras

| Regra | Origem |
|---|---|
| 4 horários (08h, 10h, 13h, 15h), regra de ocupação, dupla validação, 3 marcos, chapas e equipamentos por descarga, reagendamento por caso fortuito, cancelamento com vaga decidida pelo armazém, não recebimento com motivo | Dossiê, seção 4, e Regulamento, Tarefa 1 |
| Portaria confere o caminhão e registra a chegada; Insumos verifica a autorização de Compras e define os armazéns de destino | Decisão da equipe sobre quem, na operação, faz o papel de "responsável pelo armazém" na conferência e no direcionamento. Detalhes em [FLUXO-PORTARIA-INSUMOS.md](FLUXO-PORTARIA-INSUMOS.md) |
| Tolerância de 15 min; aviso de 16 a 29 min; perda da agenda a partir de 30 min, com não recebimento por `ATRASO_AGENDAMENTO` | Esclarecimento da Cocapec registrado pela equipe (não consta no dossiê) |
| Recusa de Insumos grava não recebimento com motivo `DIVERGENCIA_NF_PEDIDO` e a justificativa | Decisão da equipe |

O caso de uso representa o processo proposto. Os status técnicos e as regras de cálculo estão em [`API-TAREFA1.md`](API-TAREFA1.md), [`API-TAREFA2.md`](API-TAREFA2.md) e [`API-TAREFA3.md`](API-TAREFA3.md).
