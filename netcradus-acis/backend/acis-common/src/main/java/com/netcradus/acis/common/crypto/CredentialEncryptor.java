package com.netcradus.acis.common.crypto;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM encrypt/decrypt for third-party credentials ACIS must hold in a
 * genuinely reversible form (e.g. a tenant's Cloudflare API token — needed to
 * actually call Cloudflare on their behalf, unlike ACIS's own API keys, which
 * are one-way hashed since nothing ever needs the raw value back).
 *
 * Output format is base64(iv[12] || ciphertext || GCM tag[16]) as a single
 * string, so callers store/retrieve one opaque column. The key is never
 * stored alongside the ciphertext — it comes from
 * CREDENTIAL_ENCRYPTION_KEY (base64, 32 raw bytes), supplied per-environment.
 * Losing that key makes every stored credential permanently unrecoverable —
 * that's the intended failure mode (no silent fallback to an unencrypted or
 * hardcoded key).
 */
public final class CredentialEncryptor {

    private static final String ALGO = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private CredentialEncryptor() {}

    public static String encrypt(String plaintext, String base64Key) {
        try {
            SecretKeySpec key = keyFrom(base64Key);
            byte[] iv = new byte[IV_LENGTH_BYTES];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGO);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt credential", e);
        }
    }

    public static String decrypt(String encoded, String base64Key) {
        try {
            SecretKeySpec key = keyFrom(base64Key);
            byte[] combined = Base64.getDecoder().decode(encoded);
            byte[] iv = new byte[IV_LENGTH_BYTES];
            byte[] ciphertext = new byte[combined.length - IV_LENGTH_BYTES];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH_BYTES);
            System.arraycopy(combined, IV_LENGTH_BYTES, ciphertext, 0, ciphertext.length);

            Cipher cipher = Cipher.getInstance(ALGO);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to decrypt credential — wrong key, or data corrupted", e);
        }
    }

    private static SecretKeySpec keyFrom(String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            throw new IllegalStateException(
                "CREDENTIAL_ENCRYPTION_KEY is not set — cannot store or read third-party credentials without it.");
        }
        byte[] raw = Base64.getDecoder().decode(base64Key);
        if (raw.length != 32) {
            throw new IllegalStateException(
                "CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256 (got " + raw.length + ")");
        }
        return new SecretKeySpec(raw, "AES");
    }
}
