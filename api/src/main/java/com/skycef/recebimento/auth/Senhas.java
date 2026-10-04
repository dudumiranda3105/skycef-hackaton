package com.skycef.recebimento.auth;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Hash de senha com PBKDF2-SHA256 e sal aleatório, só com o JDK. Formato: pbkdf2$iterações$sal$hash. */
public final class Senhas {
    private static final int ITERACOES = 210_000;
    private static final int BYTES_SAL = 16;
    private static final int BITS_CHAVE = 256;
    private static final SecureRandom ALEATORIO = new SecureRandom();

    private Senhas() { }

    public static String hash(String senha) {
        byte[] sal = new byte[BYTES_SAL];
        ALEATORIO.nextBytes(sal);
        byte[] derivado = derivar(senha.toCharArray(), sal, ITERACOES);
        return "pbkdf2$" + ITERACOES + "$" + Base64.getEncoder().encodeToString(sal)
                + "$" + Base64.getEncoder().encodeToString(derivado);
    }

    public static boolean confere(String senha, String guardado) {
        if (senha == null || guardado == null) return false;
        try {
            String[] partes = guardado.split("\\$");
            if (partes.length != 4 || !partes[0].equals("pbkdf2")) return false;
            int iteracoes = Integer.parseInt(partes[1]);
            byte[] sal = Base64.getDecoder().decode(partes[2]);
            byte[] esperado = Base64.getDecoder().decode(partes[3]);
            return MessageDigest.isEqual(esperado, derivar(senha.toCharArray(), sal, iteracoes));
        } catch (RuntimeException erro) {
            return false;
        }
    }

    private static byte[] derivar(char[] senha, byte[] sal, int iteracoes) {
        try {
            SecretKeyFactory fabrica = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return fabrica.generateSecret(new PBEKeySpec(senha, sal, iteracoes, BITS_CHAVE)).getEncoded();
        } catch (GeneralSecurityException erro) {
            throw new IllegalStateException(erro);
        }
    }
}
