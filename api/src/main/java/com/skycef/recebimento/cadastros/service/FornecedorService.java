package com.skycef.recebimento.cadastros.service;

import com.skycef.recebimento.cadastros.repository.FornecedorRepository;
import com.skycef.recebimento.shared.error.RecursoNaoEncontradoException;
import org.springframework.stereotype.Service;

@Service
public class FornecedorService {

    private final FornecedorRepository fornecedores;

    public FornecedorService(FornecedorRepository fornecedores) {
        this.fornecedores = fornecedores;
    }

    public void exigirExistente(Long fornecedorId) {
        if (fornecedorId == null || !fornecedores.existsById(fornecedorId)) {
            throw new RecursoNaoEncontradoException("Fornecedor não encontrado: " + fornecedorId);
        }
    }
}
