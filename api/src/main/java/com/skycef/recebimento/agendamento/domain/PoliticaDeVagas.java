package com.skycef.recebimento.agendamento.domain;

import java.util.List;

/**
 * Regra de ocupacao de horario (dossie, secao 4).
 *
 * <ul>
 *   <li>Carga batida reserva o horario somente para si.</li>
 *   <li>Sem carga batida, cabem ate 2 caminhoes (paletizados ou big bag).</li>
 *   <li>O limite vale para a cooperativa inteira, nao por armazem.</li>
 *   <li>No reagendamento por caso fortuito, o limite pode ser desconsiderado.</li>
 * </ul>
 */
public final class PoliticaDeVagas {

    public static final int MAX_NAO_BATIDO_POR_HORARIO = 2;

    private PoliticaDeVagas() {
    }

    /**
     * @param ocupantes     agendamentos ativos ja alocados naquele (data, horario)
     * @param novo          acondicionamento do caminhao que quer entrar
     * @param ignorarLimite true apenas em reagendamento por caso fortuito
     */
    public static boolean cabe(List<Acondicionamento> ocupantes, Acondicionamento novo, boolean ignorarLimite) {
        if (ignorarLimite) {
            return true;
        }
        if (ocupantes.contains(Acondicionamento.BATIDO)) {
            return false;
        }
        if (novo == Acondicionamento.BATIDO) {
            return ocupantes.isEmpty();
        }
        return ocupantes.size() < MAX_NAO_BATIDO_POR_HORARIO;
    }
}
