package expo.modules.paperworknative

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

class PaperworkError(message: String, cause: Throwable? = null) : CodedException("ERR_PAPERWORK", message, cause)

class PaperworkNativeModule : Module() {
  private var pendingScan: Promise? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  /** Decode at most ~maxSide pixels on the long edge to keep memory bounded for big scans. */
  private fun decodeBounded(bytes: ByteArray, maxSide: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: throw PaperworkError("A page could not be read as an image.")
  }

  override fun definition() = ModuleDefinition {
    Name("PaperworkNative")

    /** Opens Google's document scanner (edge detection, crop, cleanup). Resolves with page image URIs; empty if cancelled. */
    AsyncFunction("scan") { pageLimit: Int, promise: Promise ->
      val activity: Activity = appContext.currentActivity ?: return@AsyncFunction promise.reject(PaperworkError("The app is not in the foreground."))
      if (pendingScan != null) return@AsyncFunction promise.reject(PaperworkError("A scan is already open."))
      val options = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setPageLimit(pageLimit.coerceIn(1, 30))
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .build()
      pendingScan = promise
      GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
        .addOnSuccessListener { sender ->
          try {
            activity.startIntentSenderForResult(sender, SCAN_REQUEST, null, 0, 0, 0)
          } catch (e: Exception) {
            pendingScan = null
            promise.reject(PaperworkError("Could not open the scanner.", e))
          }
        }
        .addOnFailureListener { e ->
          pendingScan = null
          promise.reject(PaperworkError("The scanner is not available on this phone. Import images instead.", e))
        }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != SCAN_REQUEST) return@OnActivityResult
      val promise = pendingScan ?: return@OnActivityResult
      pendingScan = null
      if (payload.resultCode != Activity.RESULT_OK) return@OnActivityResult promise.resolve(emptyList<String>())
      val result = GmsDocumentScanningResult.fromActivityResultIntent(payload.data)
      promise.resolve(result?.pages?.map { it.imageUri.toString() } ?: emptyList<String>())
    }

    /** On-device OCR. Works offline; the model ships inside the APK. */
    AsyncFunction("recognize") { uri: String ->
      try {
        val image = InputImage.fromFilePath(context, Uri.parse(uri))
        Tasks.await(recognizer.process(image)).text
      } catch (e: MlKitException) {
        throw PaperworkError("Text recognition failed on this page.", e)
      }
    }

    /** Encrypt a page into private storage. Returns the stored size in bytes. */
    AsyncFunction("importPage") { sourceUri: String, relativeName: String ->
      val bytes = Vault.readSource(context, sourceUri)
      Vault.encrypt(context, bytes, relativeName).length().toDouble()
    }

    /** Decrypt a page to a short-lived cache file for display or sharing. */
    AsyncFunction("openPage") { relativeName: String ->
      val target = File(Vault.plainCacheDir(context), relativeName.replace('/', '_'))
      if (!target.exists()) target.writeBytes(Vault.decrypt(context, relativeName))
      Uri.fromFile(target).toString()
    }

    Function("clearPlainCache") { Vault.clearPlainCache(context) }

    AsyncFunction("deletePages") { relativeNames: List<String> ->
      for (name in relativeNames) {
        runCatching { Vault.resolve(context, name).delete() }
        runCatching { File(Vault.plainCacheDir(context), name.replace('/', '_')).delete() }
      }
    }

    /** Builds a PDF, one page per image, scaled to fit A4 at about 150 dpi. Returns a file URI in the cache. */
    AsyncFunction("exportPdf") { relativeNames: List<String>, fileName: String ->
      if (relativeNames.isEmpty()) throw PaperworkError("This document has no pages.")
      val pdf = PdfDocument()
      try {
        relativeNames.forEachIndexed { index, name ->
          val bitmap = decodeBounded(Vault.decrypt(context, name), 1800)
          // A4 is 595 x 842 points; keep the image's aspect ratio inside it.
          val landscape = bitmap.width > bitmap.height
          val pageW = if (landscape) 842 else 595
          val pageH = if (landscape) 595 else 842
          val page = pdf.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, index + 1).create())
          val scale = minOf(pageW.toFloat() / bitmap.width, pageH.toFloat() / bitmap.height)
          val w = (bitmap.width * scale).toInt()
          val h = (bitmap.height * scale).toInt()
          val left = (pageW - w) / 2
          val top = (pageH - h) / 2
          page.canvas.drawColor(Color.WHITE)
          page.canvas.drawBitmap(bitmap, null, Rect(left, top, left + w, top + h), null)
          pdf.finishPage(page)
          bitmap.recycle()
        }
        val safe = fileName.replace(Regex("[^A-Za-z0-9 ._-]"), "").trim().ifEmpty { "Document" }.take(80)
        val out = File(Vault.plainCacheDir(context), "$safe.pdf")
        FileOutputStream(out).use { pdf.writeTo(it) }
        Uri.fromFile(out).toString()
      } finally {
        pdf.close()
      }
    }

    OnDestroy {
      runCatching { recognizer.close() }
    }
  }

  companion object {
    private const val SCAN_REQUEST = 6401
  }
}
