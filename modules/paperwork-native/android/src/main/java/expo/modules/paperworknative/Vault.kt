package expo.modules.paperworknative

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypts document images at rest with an AES-256-GCM key that lives in the Android Keystore
 * (hardware-backed on most phones) and can never be exported. File format: IV (12) || ciphertext+tag.
 */
object Vault {
  private const val ALIAS = "paperwork_files_v1"
  private const val IV_BYTES = 12

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  private val SAFE_NAME = Regex("^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$")

  /** Resolve a relative name inside the private documents folder, refusing anything that could escape it. */
  fun resolve(context: Context, relative: String): File {
    require(SAFE_NAME.matches(relative) && !relative.contains("..")) { "Invalid file name." }
    return File(File(context.filesDir, "vault"), relative)
  }

  fun readSource(context: Context, uri: String): ByteArray {
    val parsed = Uri.parse(uri)
    val stream = if (parsed.scheme == null || parsed.scheme == "file") File(parsed.path ?: uri).inputStream()
      else context.contentResolver.openInputStream(parsed) ?: throw IllegalStateException("Could not open the scanned page.")
    return stream.use { it.readBytes() }
  }

  fun encrypt(context: Context, plain: ByteArray, relative: String): File {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val sealed = cipher.iv + cipher.doFinal(plain)
    val target = resolve(context, relative)
    target.parentFile?.mkdirs()
    val temp = File(target.parentFile, "${target.name}.tmp")
    temp.writeBytes(sealed)
    if (!temp.renameTo(target)) {
      temp.delete()
      throw IllegalStateException("Could not save the page.")
    }
    return target
  }

  fun decrypt(context: Context, relative: String): ByteArray {
    val sealed = resolve(context, relative).readBytes()
    require(sealed.size > IV_BYTES + 16) { "The stored page is damaged." }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, IV_BYTES))
    return cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
  }

  fun plainCacheDir(context: Context): File = File(context.cacheDir, "plain").apply { mkdirs() }

  fun clearPlainCache(context: Context) {
    plainCacheDir(context).listFiles()?.forEach { it.deleteRecursively() }
  }
}
