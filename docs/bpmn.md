# BPMN — processo proposto

O [diagrama SVG](bpmn.svg) usa eventos (círculos; borda grossa = fim), tarefas (retângulos arredondados), gateways exclusivos (losangos), fluxos de sequência (setas contínuas) e uma raia por responsável. Tarefas em vermelho claro geram não recebimento; tarefas em amarelo são desvios do fluxo normal. A representação cobre T1 a T3.

![BPMN do processo proposto](bpmn.svg)

## Fluxo textual

1. **Fornecedor:** anexa uma ou mais NFs, informa o acondicionamento (batido, paletizado ou big bag) e escolhe data e um dos 4 horários. O sistema verifica dia operacional (segunda a sexta, sem feriados) e a capacidade global do horário: carga batida ocupa o horário inteiro; sem batido, cabem até 2 paletizados/big bags. Sem vaga, o fornecedor escolhe outro horário. A agenda gera o QR da entrega.
2. **Compras:** confronta NF e pedido de compra. Recusa gera não recebimento por divergência e libera a vaga; autorização segue para a Portaria.
3. **Portaria:** no dia, lê o QR, confere caminhão, placa, NFs e destinatário e registra a chegada com a hora do servidor. Tolerância de 15 min; de 16 a 29 min, aviso de atraso; a partir de 30 min a agenda é perdida e é gravado não recebimento por `ATRASO_AGENDAMENTO`. No horário, a Portaria anexa os documentos das NFs e os envia a Insumos.
4. **Insumos:** confere os documentos e a autorização de Compras. Aprovando, direciona a entrega para 1 a 4 armazéns, o que cria uma descarga por destino. Recusando, a justificativa é obrigatória e é gravado não recebimento (`DIVERGENCIA_NF_PEDIDO`).
5. **Armazém:** em cada descarga registra a entrada (início) e a saída (fim), com a quantidade de chapas e os equipamentos usados (`chegada ≤ entrada ≤ saída`). Espera = entrada − chegada; descarga = saída − entrada. A quantidade de chapas mede aquela descarga e não é somada no dia.
6. **Desvios:** cancelamento em duas etapas (fornecedor ou armazém solicita, armazém efetiva) libera a vaga, e o armazém decide quem a ocupa. Reagendamento por caso fortuito registra horário anterior, novo e motivo, e pode exceder o limite do horário. Caminhão sem agendamento só entra se houver vaga e for agendado na hora; sem vaga, Portaria ou Armazém registram não recebimento (`SEM_AGENDAMENTO_SEM_VAGA`; também `CASO_FORTUITO` ou `OUTRO`, com descrição). Depois da conferência da Portaria, divergências são tratadas pela decisão de Insumos.
7. **Encarregado dos chapas:** no dia seguinte, lança o boletim do dia com os **4 armazéns de uma vez** (a API grava um boletim por armazém e dia), com produção por tipo de item e até 20 chapas por armazém (diária completa ou meia). O sistema calcula produção, diárias equivalentes, piso, total a pagar e complemento. Sem equipe, marca o boletim como inconsistente para conferência.
8. **Gestão:** consulta indicadores e sobra/falta de chapas em R$ com filtros de período e armazém. Os indicadores operacionais usam só registros da plataforma (`PLATAFORMA`); a análise do histórico usa a base oficial (`HISTORICO`), que não fornece tempos nem chapas por descarga.

## Origem das regras

A tolerância de 15 min e a perda da agenda a partir de 30 min vêm de esclarecimento da Cocapec registrado pela equipe; não constam no dossiê. A divisão do papel de "responsável pelo armazém" entre Portaria (conferência e chegada), Insumos (verificar a autorização de Compras e definir destinos) e Armazém (descarga) é decisão da equipe, descrita em [FLUXO-PORTARIA-INSUMOS.md](FLUXO-PORTARIA-INSUMOS.md). O sistema não escolhe automaticamente quem ocupa uma vaga cancelada.
