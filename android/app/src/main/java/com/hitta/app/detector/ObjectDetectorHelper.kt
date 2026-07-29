package com.hitta.app.detector

import android.content.Context
import android.graphics.Bitmap
import android.graphics.RectF
import com.hitta.app.Constants
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.task.vision.detector.ObjectDetector

data class DetectionResult(
    val label: String,
    val score: Float,
    val boundingBox: RectF
)

class ObjectDetectorHelper(private val context: Context) {

    private var objectDetector: ObjectDetector? = null

    fun setup() {
        try {
            val options = ObjectDetector.ObjectDetectorOptions.builder()
                .setMaxResults(10)
                .setScoreThreshold(Constants.MIN_SCORE)
                .build()
            objectDetector = ObjectDetector.createFromFileAndOptions(
                context,
                Constants.MODEL_FILE,
                options
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun detect(bitmap: Bitmap): List<DetectionResult> {
        val detector = objectDetector ?: return emptyList()
        return try {
            val tensorImage = TensorImage.fromBitmap(bitmap)
            val results = detector.detect(tensorImage)
            results.mapNotNull { detection ->
                val category = detection.categories.maxByOrNull { it.score } ?: return@mapNotNull null
                if (category.score >= Constants.MIN_SCORE) {
                    DetectionResult(
                        label = category.label,
                        score = category.score,
                        boundingBox = detection.boundingBox
                    )
                } else null
            }.sortedByDescending { it.score }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    fun close() {
        objectDetector?.close()
        objectDetector = null
    }
}
