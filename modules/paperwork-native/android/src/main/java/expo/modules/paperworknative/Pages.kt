package expo.modules.paperworknative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream

/** Decoding pages safely: bounded size whatever the source resolution, and upright per EXIF. */
object Pages {
  const val PAGE_MAX_SIDE = 2400
  const val THUMB_MAX_SIDE = 420

  fun open(context: Context, uri: String): InputStream {
    val parsed = Uri.parse(uri)
    return if (parsed.scheme == null || parsed.scheme == "file") File(parsed.path ?: uri).inputStream()
      else context.contentResolver.openInputStream(parsed) ?: throw PaperworkError("Could not open the image.")
  }

  private fun rotation(context: Context, uri: String): Int = try {
    open(context, uri).use { stream ->
      when (ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90
        ExifInterface.ORIENTATION_ROTATE_180 -> 180
        ExifInterface.ORIENTATION_ROTATE_270 -> 270
        else -> 0
      }
    }
  } catch (e: Exception) {
    0
  }

  /** Decode with inSampleSize so a 100 MP photo never becomes a 400 MB bitmap, then rotate upright. */
  fun decode(context: Context, uri: String, maxSide: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open(context, uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw PaperworkError("This file is not an image Paperwork can read.")
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val decoded = open(context, uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
      ?: throw PaperworkError("This image could not be decoded.")
    val scaled = scaleDown(decoded, maxSide)
    val degrees = rotation(context, uri)
    if (degrees == 0) return scaled
    val rotated = Bitmap.createBitmap(scaled, 0, 0, scaled.width, scaled.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
    if (rotated !== scaled) scaled.recycle()
    return rotated
  }

  fun scaleDown(bitmap: Bitmap, maxSide: Int): Bitmap {
    val longest = maxOf(bitmap.width, bitmap.height)
    if (longest <= maxSide) return bitmap
    val ratio = maxSide.toFloat() / longest
    val out = Bitmap.createScaledBitmap(bitmap, (bitmap.width * ratio).toInt().coerceAtLeast(1), (bitmap.height * ratio).toInt().coerceAtLeast(1), true)
    if (out !== bitmap) bitmap.recycle()
    return out
  }

  fun jpeg(bitmap: Bitmap, quality: Int): ByteArray = ByteArrayOutputStream().use { out ->
    bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
    out.toByteArray()
  }

  /** Deletes the plaintext source when it is a file inside our own cache (scanner output, picker copy). */
  fun deleteIfOurCache(context: Context, uri: String) {
    val parsed = Uri.parse(uri)
    if (parsed.scheme != null && parsed.scheme != "file") return
    val file = File(parsed.path ?: return)
    if (file.canonicalPath.startsWith(context.cacheDir.canonicalPath + File.separator)) file.delete()
  }
}
