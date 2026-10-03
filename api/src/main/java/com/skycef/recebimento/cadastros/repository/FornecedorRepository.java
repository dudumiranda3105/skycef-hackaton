package com.skycef.recebimento.cadastros.repository;

import com.skycef.recebimento.cadastros.entity.Fornecedor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FornecedorRepository extends JpaRepository<Fornecedor, Long> {
}
