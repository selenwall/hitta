package com.hitta.app.ui.play

import androidx.lifecycle.ViewModel
import com.hitta.app.detector.DetectionResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PlayViewModel : ViewModel() {

    private val _detectedObjects = MutableStateFlow<List<DetectionResult>>(emptyList())
    val detectedObjects: StateFlow<List<DetectionResult>> = _detectedObjects.asStateFlow()

    private val _timeLeft = MutableStateFlow(120)
    val timeLeft: StateFlow<Int> = _timeLeft.asStateFlow()

    fun updateDetections(results: List<DetectionResult>) {
        _detectedObjects.value = results
    }

    fun setTimeLeft(seconds: Int) {
        _timeLeft.value = seconds
    }
}
