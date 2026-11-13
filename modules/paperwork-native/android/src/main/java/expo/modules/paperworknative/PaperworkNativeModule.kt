package expo.modules.paperworknative

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.view.WindowManager
import com.google.android.gms.tasks.Tasks
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
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream

class PaperworkError(message: String, cause: Throwable? = null) : CodedException("ERR_PAPERWORK", message, cause)

class PaperworkNativeModule : Module() {
  private var pendingScan: Promise? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  private fun prefs() = context.getSharedPreferences("paperwork_native", Context.MODE_PRIVATE)

  private fun sanitize(name: String) = name.replace(Regex("[^A-Za-z0-9 ._-]"), "").trim().ifEmpty { "Document" }.take(80)

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
      val pages = if (payload.resultCode == Activity.RESULT_OK)
        GmsDocumentScanningResult.fromActivityResultIntent(payload.data)?.pages?.map { it.imageUri.toString() } ?: emptyList()
      else emptyList()
      val promise = pendingScan
      pendingScan = null
      if (promise != null) {
        promise.resolve(pages)
      } else if (pages.isNotEmpty()) {
        // The app was killed while the camera was open: keep the result for the next launch.
        prefs().edit().putString("pendingScan", JSONArray(pages).toString()).apply()
      }
    }

    Function("hasPendingScan") { prefs().contains("pendingScan") }

    /** Pages from a scan that finished after Android restarted the app. Returned once. */
    Function("takePendingScan") {
      val json = prefs().getString("pendingScan", null) ?: return@Function emptyList<String>()
      prefs().edit().remove("pendingScan").apply()
      val array = try { JSONArray(json) } catch (e: Exception) { JSONArray() }
      (0 until array.length()).map { array.optString(it) }.filter { uri ->
        val path = Uri.parse(uri).path
        path == null || File(path).exists()
      }
    }

    /**
     * One page end to end: decode at a bounded size (upright), read its text, store an encrypted
     * page and thumbnail, then delete the plaintext source if it is in our cache.
     */
    AsyncFunction("importPage") { sourceUri: String, baseName: String ->
      val bitmap = try {
        Pages.decode(context, sourceUri, Pages.PAGE_MAX_SIDE)
      } catch (e: OutOfMemoryError) {
        throw PaperworkError("This image is too large to process.")
      }
      try {
        val text = try {
          Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0))).text
        } catch (e: Exception) {
          ""
        }
        val page = Vault.encrypt(context, Pages.jpeg(bitmap, 85), "$baseName.jpg")
        val thumb = Pages.scaleDown(bitmap.copy(bitmap.config ?: android.graphics.Bitmap.Config.ARGB_8888, false), Pages.THUMB_MAX_SIDE)
        Vault.encrypt(context, Pages.jpeg(thumb, 75), "$baseName.thumb.jpg")
        thumb.recycle()
        Pages.deleteIfOurCache(context, sourceUri)
        mapOf("name" to "$baseName.jpg", "thumb" to "$baseName.thumb.jpg", "text" to text, "bytes" to page.length().toDouble())
      } finally {
        bitmap.recycle()
      }
    }

    /** Remove a plaintext source without importing it (cancelled review, recovered scan discarded). */
    Function("discardSource") { uri: String -> Pages.deleteIfOurCache(context, uri) }

    /** Decrypt a page to a short-lived cache file for display. Written atomically under a unique name. */
    AsyncFunction("openPage") { relativeName: String ->
      val target = File(Vault.plainDir(context), relativeName.replace('/', '_'))
      if (!target.exists()) {
        val temp = File.createTempFile("page", ".tmp", Vault.plainDir(context))
        temp.writeBytes(Vault.decrypt(context, relativeName))
        if (!temp.renameTo(target)) temp.delete()
      }
      Uri.fromFile(target).toString()
    }

    Function("clearPlainCache") { Vault.clearPlain(context) }

    Function("sweepCaches") { Vault.sweepCaches(context) }

    AsyncFunction("sweepOrphans") { keepDocIds: List<String> -> Vault.sweepOrphans(context, keepDocIds.toSet()) }

    AsyncFunction("deleteDocumentFiles") { docId: String ->
      if (docId.matches(Regex("^[A-Za-z0-9-]+$"))) File(Vault.root(context), docId).deleteRecursively()
    }

    AsyncFunction("wipeVault") { Vault.wipe(context) }

    /** Copy one decrypted page out for sharing. */
    AsyncFunction("exportPage") { relativeName: String, fileName: String ->
      val out = File(Vault.exportDir(context), "${sanitize(fileName)}.jpg")
      out.writeBytes(Vault.decrypt(context, relativeName))
      Uri.fromFile(out).toString()
    }

    /** One page per image on an A4 canvas at about 150 dpi. Pages are drawn one at a time to bound memory. */
    AsyncFunction("exportPdf") { relativeNames: List<String>, fileName: String ->
      if (relativeNames.isEmpty()) throw PaperworkError("This document has no pages.")
      val pdf = PdfDocument()
      try {
        relativeNames.forEachIndexed { index, name ->
          val plain = Vault.decrypt(context, name)
          val decoded = android.graphics.BitmapFactory.decodeByteArray(plain, 0, plain.size) ?: throw PaperworkError("A page could not be read.")
          val bitmap = Pages.scaleDown(decoded, 1240)
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
        val out = File(Vault.exportDir(context), "${sanitize(fileName)}.pdf")
        FileOutputStream(out).use { pdf.writeTo(it) }
        Uri.fromFile(out).toString()
      } finally {
        pdf.close()
      }
    }

    /** Keep documents out of screenshots and the recent-apps thumbnail. */
    Function("setSecure") { secure: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread {
        if (secure) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
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
