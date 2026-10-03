# BPMN — processo proposto

O [diagrama SVG](bpmn.svg) usa eventos (círculos), tarefas (retângulos arredondados), gateways exclusivos (losangos), fluxos de sequência (setas contínuas) e raias por responsável. A representação é uma vista compacta do processo de T1 a T3.

## Fluxo textual

1. **Fornecedor:** prepara uma ou mais NFs, escolhe acondicionamento e solicita data/horário. O sistema verifica dia operacional e capacidade global. Sem vaga, escolhe outro slot; chegada sem agendamento e sem vaga gera não recebimento.
2. **Compras:** confronta NF e pedido. Recusa gera não recebimento por divergência e libera o slot; autorização permite definir destinos.
3. **Armazém:** define um ou mais armazéns de destino, criando uma descarga para cada um. Registra chegada do caminhão, entrada e saída de cada descarga, quantidade de chapas e equipamentos usados. `chegada ≤ entrada ≤ saída`.
4. **Exceções:** cancelamento exige solicitação e efetivação; o armazém decide o destino da vaga liberada. Reagendamento por caso fortuito registra horário anterior, novo e motivo; pode exceder a capacidade. Não recebimento guarda motivo.
5. **Encarregado dos chapas:** registra um boletim por armazém/dia, linhas de produção e até 20 chapas. O sistema calcula produção, diárias equivalentes, piso, total e complemento. Sem equipe, marca inconsistência para conferência.
6. **Gestão:** consulta indicadores e sobra/falta em R$ com filtros de período/armazém e origem (`HISTORICO`, `PLATAFORMA`, `TESTE`). O histórico não fornece tempos ou chapas por descarga.

Os desvios são rotas alternativas do processo; o diagrama não fixa tolerância de atraso nem decide automaticamente quem ocupa uma vaga cancelada.
