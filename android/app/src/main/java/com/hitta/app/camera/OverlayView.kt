package com.hitta.app.camera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import com.hitta.app.detector.DetectionResult
import com.hitta.app.util.Translations

class OverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var results: List<DetectionResult> = emptyList()
    private var imageWidth: Int = 1
    private var imageHeight: Int = 1
    private var rotation: Int = 0

    private val boxPaint = Paint().apply {
        color = Color.parseColor("#36d399")
        style = Paint.Style.STROKE
        strokeWidth = 4f
    }

    private val textBgPaint = Paint().apply {
        color = Color.parseColor("#CC000000")
        style = Paint.Style.FILL
    }

    private val textPaint = Paint().apply {
        color = Color.WHITE
        textSize = 36f
        isFakeBoldText = true
    }

    fun setResults(
        results: List<DetectionResult>,
        imageWidth: Int,
        imageHeight: Int,
        rotation: Int = 0
    ) {
        this.results = results
        this.imageWidth = imageWidth
        this.imageHeight = imageHeight
        this.rotation = rotation
        invalidate()
    }

    fun clearResults() {
        results = emptyList()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (results.isEmpty()) return

        val viewWidth = width.toFloat()
        val viewHeight = height.toFloat()

        // Scale factors from image coordinates to view coordinates
        val scaleX = viewWidth / imageWidth.toFloat()
        val scaleY = viewHeight / imageHeight.toFloat()

        for (result in results) {
            val box = result.boundingBox
            val scaledBox = RectF(
                box.left * scaleX,
                box.top * scaleY,
                box.right * scaleX,
                box.bottom * scaleY
            )

            // Draw bounding box
            canvas.drawRect(scaledBox, boxPaint)

            // Draw label background and text
            val label = "${Translations.translate(result.label)} ${"%.0f".format(result.score * 100)}%"
            val textWidth = textPaint.measureText(label)
            val textHeight = textPaint.textSize

            val textX = scaledBox.left
            val textY = if (scaledBox.top > textHeight + 8) scaledBox.top - 8 else scaledBox.bottom + textHeight + 8

            canvas.drawRect(
                textX,
                textY - textHeight,
                textX + textWidth + 8,
                textY + 4,
                textBgPaint
            )
            canvas.drawText(label, textX + 4, textY, textPaint)
        }
    }
}
