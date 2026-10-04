# Diferenciais implementados

Os sete diferenciais priorizados pelo grupo (documento *Diferenciais priorizados* do projeto) estão na interface
`/ui/` e funcionam como **extensões**: se um deles falhar, o fluxo obrigatório (agendar, validar em Compras, receber,
fechar o boletim, painel) continua igual. Nenhum altera regra do Regulamento, do Dossiê ou dos esclarecimentos.
Código em `web/src/features/` e `web/src/lib/` (compilado para `/ui/`).

| # | Diferencial | Onde | Arquivo |
|---|---|---|---|
| 1 | QR Code + check-in | confirmação do agendamento, gaveta da entrega, botão "Check-in por QR" no Armazém, link `#/checkin/<id>` | `features/checkin/janelas.tsx`, `lib/qr.ts` |
| 2 | Planejamento D-1 | painel **Planejamento D-1** | `features/d1.tsx`, `lib/d1.ts` |
| 3 | Simulador de equipe | final do painel **Planejamento D-1** | `features/d1.tsx`, `lib/d1.ts` |
| 4 | Adicionar ao calendário | confirmação do agendamento e gaveta da entrega | `features/agenda/detalhe.tsx`, `features/checkin/janelas.tsx` |
| 5 | Leitura assistida da NF | novo agendamento, ao anexar o XML ou o PDF | `features/agenda/novo.tsx`, `lib/nf.ts` |
| 6 | Pergunte aos Dados | painel **Pergunte aos dados** | `features/perguntar.tsx`, `lib/pergunte.ts` |
| 7 | Qualidade dos Dados | painel **Qualidade dos dados** e bloco "Sobre este dado" de cada indicador | `features/qualidade.tsx`, `features/painel.tsx` |

## 1. QR Code + check-in
- Ao concluir o agendamento a tela mostra o QR da entrega (código `AG-0012`). O QR é gerado no navegador, sem biblioteca
  externa, então funciona sem internet. Ele aponta para `/ui/#/checkin/<id>`.
- A tela de check-in localiza a entrega, mostra o estado e só oferece a ação permitida: registrar chegada, iniciar
  descarga (entrada) e finalizar (saída, com chapas e equipamentos). Cada registro usa a hora do servidor e passa pelas
  mesmas validações da API (`chegada ≤ entrada ≤ saída`, autorização de Compras).
- **Regra de segurança:** o QR identifica a entrega. Ele não autoriza o recebimento, não ignora validação e não
  substitui permissões.
- Quem não usa câmera digita o código ou cola o link. Se o navegador tiver `BarcodeDetector`, há leitura pela câmera.

## 2 e 3. Planejamento D-1 e Simulador de equipe
- O D-1 usa os agendamentos já cadastrados do próximo dia operacional: total de entregas, distribuição por horário,
  armazém e acondicionamento, alertas e o botão **"Por quê?"** (quais agendamentos contribuem e como o nível foi decidido).
- **Cuidado metodológico:** não há número exato de chapas. O módulo trabalha com **níveis**. Para cada armazém e horário:
  `necessidade = Σ chapas simultâneas pela norma do Dossiê (batido 5, paletizado/big bag 2)`; `razão = necessidade ÷ equipe`.
  Acima de 1,0 é pressão alta; acima de 0,7 é moderada; até 0,7 é compatível; até 0,4 indica capacidade potencialmente
  disponível para realocação. **Os limiares são parâmetros do projeto, não da Cocapec** (`D1_LIM` em `lib/d1.ts`).
- Equipe usada = média de chapas dos últimos 5 boletins do armazém (referência, não a escala de amanhã) ou a do simulador.
- DQ-016 (paletizado/big bag abaixo de 500 kg: 0 ou 2 chapas) segue em aberto: usamos 2 e sinalizamos.
- O **Simulador** altera só a equipe, com o mesmo motor. Não grava nada, não altera boletim nem agendamento, não recomenda
  contratação ou demissão e não inventa impacto financeiro. Linguagem: "capacidade disponível para realocação".

## 4. Adicionar ao calendário
Gera um arquivo `.ics` padrão (data, horário, código da entrega, fornecedor, NFs, link do check-in e alarme de 1 hora).
O calendário é só conveniência: mudar o compromisso no celular não muda o agendamento. A fonte oficial é o sistema.

## 5. Leitura assistida da NF
- **XML da NF-e:** lê número, chave de acesso, emitente, itens, peso e volumes.
- **PDF (DANFE com texto):** localiza a chave de 44 dígitos, validando o dígito verificador, e dela deriva número e CNPJ do emitente.
- O resultado vira um cartão que o fornecedor **confirma ou corrige** antes de agendar; sem confirmar, o agendamento é bloqueado.
  Se o CNPJ do emitente está no cadastro, o fornecedor é sugerido; se for diferente do escolhido, aparece um aviso.
- A leitura não aprova a entrega e não substitui a validação NF × pedido de Compras.
- **Falha segura:** se a leitura falhar, o fluxo manual continua, e o arquivo ainda é anexado.
- **Limite:** não há OCR de imagem. PDF escaneado (sem texto) exigiria um motor de OCR, que não vai embutido; nesse caso o
  sistema avisa e o fornecedor preenche à mão.

## 6. Pergunte aos Dados
- Fluxo: pergunta → interpretação → **uma métrica permitida** → cálculo → resposta com número, período, filtros e origem.
  Não existe SQL livre, e a interpretação nunca calcula nem inventa número.
- Métricas do catálogo: complemento pago, tempo médio de espera, tempo médio de descarga, chapas por descarga, custo da
  operação, não recebimentos (por motivo), armazém com mais recebimentos, fornecedores de maior volume, descargas concluídas,
  sobra ou falta de chapas, Planejamento D-1 e "por que há pressão amanhã".
- Os números vêm de `/api/painel/*`, `/api/boletins` e do motor do D-1. Pergunta fora do catálogo recebe "não sei", com sugestões.
- **Estado atual honesto:** a interpretação usa regras locais (palavras-chave, armazém, período). Para ligar um modelo de
  linguagem, troque `interpretar()` em `lib/pergunte.ts` por uma chamada em servidor (a chave `ANTHROPIC_API_KEY` não pode ir
  para o navegador) que devolva só `{metrica, armazem, periodo, motivo}` do catálogo. O restante não muda.

## 7. Qualidade dos Dados
- Painel com período coberto por fonte, registros processados e válidos, duplicidades e tratamentos (carga documentada em
  `relatorio-gerencial.md`, seção 7), períodos incompletos, campos ausentes e limitações.
- Registros da plataforma são contados ao vivo; os números do pacote histórico vêm da carga documentada e estão marcados como tal.
- Cada indicador do painel gerencial abre **"Ver cálculo"** com a tabela *Sobre este dado*: indicador, fórmula, fonte, período,
  registros e limitação.

## Boletim do dia com os 4 armazéns
O boletim passou a ser lançado **por dia, com os 4 armazéns de uma vez** (abas por armazém, um fechamento do dia e um
botão "Salvar boletim do dia"). A persistência não mudou: a API grava um boletim por armazém e por dia
(`UNIQUE(armazem_id, data)`), o que mantém o painel por armazém. A tela valida todos antes de gravar e, se algum falhar,
informa quais foram gravados e não repete os já gravados.
