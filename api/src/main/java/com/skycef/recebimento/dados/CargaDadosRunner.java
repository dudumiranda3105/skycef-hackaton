package com.skycef.recebimento.dados;

import java.nio.file.Path;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** CLI: java -jar recebimento.jar --dados=C:/caminho/DADOS_HACKATHON_2026.zip */
@Component
public class CargaDadosRunner implements ApplicationRunner {
    private final CargaDadosService service;
    public CargaDadosRunner(CargaDadosService service) { this.service = service; }

    @Override public void run(ApplicationArguments args) throws Exception {
        String caminho = null;
        String[] raw = args.getSourceArgs();
        for (int i = 0; i < raw.length; i++) {
            if (raw[i].startsWith("--dados=")) caminho = raw[i].substring("--dados=".length());
            else if (raw[i].equals("--dados")) {
                if (i + 1 >= raw.length) throw new IllegalArgumentException("Informe o caminho após --dados.");
                caminho = raw[++i];
            }
        }
        if (caminho == null) return;
        CargaDadosService.Resumo resumo = service.carregar(Path.of(caminho));
        System.out.println("linhas_lidas: " + resumo.linhasLidas());
        System.out.println("duplicadas_descartadas: " + resumo.duplicadasDescartadas());
        System.out.println("parciais_agrupados: " + resumo.parciaisAgrupados());
        System.out.println("recebimentos_inseridos: " + resumo.recebimentosInseridos());
        System.out.println("sabados_com_recebimento: " + resumo.sabadosComRecebimento());
        System.out.println("recebimento_antes_do_documento: " + resumo.recebimentoAntesDoDocumento());
        System.out.println("sem_chave_de_acesso: " + resumo.semChaveDeAcesso());
        System.out.println("chave_de_acesso_malformada: " + resumo.chaveDeAcessoMalformada());
        System.out.println("dias_da_folha: " + resumo.diasDaFolha());
        System.out.println("chapas_distintos: " + resumo.chapasDistintos());
        System.out.println("chapas_novos: " + resumo.chapasNovos());
    }
}
