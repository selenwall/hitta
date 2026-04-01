package com.hitta.app.ui.detect

import androidx.lifecycle.ViewModel
import com.hitta.app.detector.DetectionResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DetectViewModel : ViewModel() {

    private val _detectedObjects = MutableStateFlow<List<DetectionResult>>(emptyList())
    val detectedObjects: StateFlow<List<DetectionResult>> = _detectedObjects.asStateFlow()

    private val _isDetecting = MutableStateFlow(true)
    val isDetecting: StateFlow<Boolean> = _isDetecting.asStateFlow()

    fun updateDetections(results: List<DetectionResult>) {
        _detectedObjects.value = results
    }

    fun setDetecting(detecting: Boolean) {
        _isDetecting.value = detecting
    }
}
