package com.skycef.recebimento.dados;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Lê a pasta extraída ou o ZIP original sem copiar os dados para o projeto. */
public final class FonteDados implements AutoCloseable {
    private final Path caminho;
    private final ZipFile zip;

    public FonteDados(Path caminho) throws IOException {
        if (!Files.exists(caminho)) throw new IOException("Dados não encontrados: " + caminho);
        this.caminho = caminho;
        this.zip = Files.isRegularFile(caminho) ? new ZipFile(caminho.toFile()) : null;
    }

    public InputStream abrir(String relativo) throws IOException {
        String normal = relativo.replace('\\', '/');
        if (zip != null) {
            ZipEntry entry = zip.stream().filter(e -> e.getName().replace('\\', '/').endsWith("/" + normal)
                    || e.getName().equals(normal)).findFirst().orElse(null);
            if (entry == null) throw new IOException("Arquivo ausente no ZIP: " + relativo);
            return zip.getInputStream(entry);
        }
        Path direto = caminho.resolve(relativo).normalize();
        if (Files.isRegularFile(direto)) return Files.newInputStream(direto);
        try (Stream<Path> filhos = Files.list(caminho)) {
            Path encontrado = filhos.map(p -> p.resolve(relativo)).filter(Files::isRegularFile).findFirst().orElse(null);
            if (encontrado != null) return Files.newInputStream(encontrado);
        }
        throw new IOException("Arquivo ausente: " + relativo);
    }

    @Override public void close() throws IOException { if (zip != null) zip.close(); }
}
