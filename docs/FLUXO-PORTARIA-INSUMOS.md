# Conferência da Portaria e decisão de Insumos

O envio entre setores acontece dentro do sistema: a API grava a conferência e os documentos no PostgreSQL, e a tela de Insumos consulta a fila. A decisão é gravada na mesma entrega e aparece de volta na Portaria. As páginas abertas consultam as atualizações a cada 15 segundos e também têm botão de atualização manual.

## Como usar

1. O fornecedor agenda a entrega, informa suas NFs e, se já definida, a placa prevista. O sistema gera o QR da entrega. Compras autoriza o pedido.
2. Na Portaria, o porteiro lê o QR pela câmera, envia uma imagem do QR ou digita o código `AG-…`.
3. O sistema consulta a entrega na API. O porteiro compara os dados exibidos com o caminhão e os documentos: placa, fornecedor, número/chave de cada NF e razão social/CNPJ do destinatário. Ele confirma as conferências e registra a chegada.
4. O porteiro fotografa ou anexa cada NF. Um documento já anexado pode ser utilizado após conferência. Ao clicar em **Enviar documentos para Insumos**, a entrega entra na fila do setor.
5. Insumos abre os documentos de todas as NFs, confirma a conferência e seleciona de um a quatro armazéns. **Validar e direcionar** cria as descargas dos destinos. **Recusar recebimento** exige justificativa, registra o não recebimento e devolve a justificativa à Portaria.
6. A Portaria consulta o retorno com os destinos aprovados. Cada armazém registra o início e o fim da sua descarga.

## O que o QR verifica

O QR contém o link da entrega no sistema. O leitor aceita links da origem atual e códigos completos; links de outros sistemas são rejeitados. A API exige usuário autenticado e confere novamente autorização de Compras, data da entrega, notas ativas e placa prevista, quando preenchida.

O QR identifica um agendamento. A presença física do caminhão e o destinatário de uma foto/PDF são conferidos pelo porteiro. Quando a agenda não informa a placa prevista, a tela deixa explícita a necessidade de conferência pessoal. Preencher a placa prevista permite compará-la automaticamente no servidor com a placa registrada na chegada.

## Estados do recebimento

| Estado | Significado | Próximo responsável |
|---|---|---|
| `AGUARDANDO_DOCUMENTOS` | Caminhão conferido e chegada registrada | Portaria anexa os documentos |
| `PENDENTE_INSUMOS` | Documentação enviada e congelada para análise | Insumos decide |
| `DIRECIONADO` | Destinos aprovados e descargas criadas | Portaria orienta; armazéns descarregam |
| `RECUSADO` | Recebimento recusado com justificativa | Portaria consulta o motivo |

O agendamento mantém seu status operacional (`AUTORIZADO`, `EM_DESCARGA`, etc.). A situação da conferência é um registro separado para acompanhar a comunicação entre setores.

## Regras aplicadas no servidor

- Toda agenda nova exige conferência e decisão de Insumos. O formulário não pode desativar essa exigência. Agendas anteriores à migração mantêm seu fluxo anterior.
- Apenas PORTEIRO/ADMIN conferem e enviam; apenas INSUMO/ADMIN decidem. Insumos pode baixar os anexos e não pode trocá-los.
- O porteiro não define o armazém pelo endpoint de destinos.
- A conferência só aceita agenda autorizada de hoje. Se a placa prevista estiver cadastrada, a placa presente precisa corresponder.
- Todas as NFs ativas precisam ser conferidas e ter documento antes do envio.
- A chegada usa a hora do servidor e é registrada antes de anexar os documentos. Uma chegada já registrada para um caminhão sem aviso é preservada.
- A tolerância é de 15 minutos. De 16 a 29 minutos há aviso de atraso. A partir de 30 minutos, sem chegada anterior registrada, perde-se a agenda e é registrado o não recebimento por atraso; a conferência não entra na fila de Insumos.
- Depois do envio, os documentos não podem ser substituídos.
- Depois da conferência, não é possível reagendar, solicitar ou efetivar cancelamento. Uma divergência deve ser tratada pela decisão de Insumos.
- Aprovar é uma única transação: se qualquer destino for inválido, nenhum destino nem aprovação é salvo.
- A descarga de uma agenda que exige conferência só inicia depois da aprovação.
- Os registros guardam o usuário e o horário da conferência, envio e decisão, com eventos de auditoria.

## API

| Método e rota | Corpo | Resultado |
|---|---|---|
| `POST /api/agendamentos/{id}/portaria/conferencia` | `placa`, `destinatarioConfirmado: true`, `notasConferidas: [ids das NFs]` | Detalhe atualizado; chegada e conferência |
| `POST /api/agendamentos/{id}/notas/{nota}/arquivo` | Multipart com campo `arquivo` | Documento vinculado à NF, até 10 MB |
| `POST /api/agendamentos/{id}/portaria/enviar` | `{}` | Situação `PENDENTE_INSUMOS` |
| `GET /api/insumos/recebimentos` | — | Lista de detalhes das entregas conferidas, pendentes primeiro |
| `POST /api/insumos/recebimentos/{id}/decisao` | `decisao: APROVAR ou RECUSAR`, `armazemIds`, `observacao` de até 250 caracteres | Aprovação com destinos ou recusa justificada |

O detalhe do agendamento inclui `placaVeiculo`, `portariaObrigatoria` e `portaria`, com situação, placa conferida, horários, responsáveis e observação.

## Leitura pela câmera

O leitor utiliza [ZXing Browser](https://github.com/zxing-js/browser), incluído no build do projeto. A câmera requer permissão do navegador e contexto seguro (HTTPS ou localhost). Em um celular acessando um endereço HTTP da rede local, use HTTPS, leitura da imagem do QR ou digitação do código. Nenhum serviço externo recebe a imagem do QR para fazer a leitura.

## Validação

Os testes de integração usam PostgreSQL em esquemas temporários separados do banco operacional. Cobrem conferência, anexos obrigatórios, fila, perfis, bloqueios, aprovação com múltiplos destinos, recusa, rollback e regras de atraso. Os dados utilizados nesses testes não entram no esquema público da aplicação.
