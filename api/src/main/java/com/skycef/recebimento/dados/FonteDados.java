package com.skycef.recebimento.dados;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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

    /** Lista fontes tabulares/documentais em uma pasta extraída ou diretamente em um ZIP. */
    public List<String> listar(String diretorio, String extensao) throws IOException {
        String dir = diretorio.replace('\\', '/').replaceAll("^/+|/+$", "");
        String ext = extensao.toLowerCase(java.util.Locale.ROOT);
        if (zip != null) {
            return zip.stream().filter(e -> !e.isDirectory()).map(e -> e.getName().replace('\\', '/'))
                    .map(n -> {
                        int i = n.lastIndexOf("/" + dir + "/");
                        if (i >= 0) return n.substring(i + 1);
                        return n.startsWith(dir + "/") ? n : null;
                    })
                    .filter(n -> n != null && n.toLowerCase(java.util.Locale.ROOT).endsWith(ext))
                    .sorted().toList();
        }
        Path base = caminho.resolve(dir).normalize();
        if (!Files.isDirectory(base)) {
            try (Stream<Path> filhos = Files.list(caminho)) {
                base = filhos.map(p -> p.resolve(dir)).filter(Files::isDirectory).findFirst().orElse(null);
            }
        }
        if (base == null || !Files.isDirectory(base)) throw new IOException("Pasta ausente: " + diretorio);
        Path raiz = base;
        try (Stream<Path> arquivos = Files.walk(raiz)) {
            return arquivos.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().toLowerCase(java.util.Locale.ROOT).endsWith(ext))
                    .map(p -> (dir + "/" + raiz.relativize(p).toString()).replace('\\', '/'))
                    .sorted().toList();
        }
    }

    @Override public void close() throws IOException { if (zip != null) zip.close(); }
}
