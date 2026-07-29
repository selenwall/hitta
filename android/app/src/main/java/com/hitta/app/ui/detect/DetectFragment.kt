package com.hitta.app.ui.detect

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hitta.app.R
import com.hitta.app.databinding.FragmentDetectBinding
import com.hitta.app.detector.DetectionResult
import com.hitta.app.detector.ObjectDetectorHelper
import com.hitta.app.ui.GameViewModel
import com.hitta.app.ui.Screen
import com.hitta.app.util.Translations
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class DetectFragment : Fragment() {

    private var _binding: FragmentDetectBinding? = null
    private val binding get() = _binding!!

    private val gameViewModel: GameViewModel by activityViewModels()
    private val detectViewModel: DetectViewModel by viewModels()

    private var gameId: String = ""
    private var myRole: String = ""

    private lateinit var cameraExecutor: ExecutorService
    private var objectDetectorHelper: ObjectDetectorHelper? = null
    private val handler = Handler(Looper.getMainLooper())
    private var lastDetectionTime = 0L
    private val detectionIntervalMs = 600L

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        gameId = arguments?.getString("gameId") ?: ""
        myRole = arguments?.getString("myRole") ?: ""
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDetectBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        cameraExecutor = Executors.newSingleThreadExecutor()

        objectDetectorHelper = ObjectDetectorHelper(requireContext()).also { it.setup() }

        // Observe screen events — only navigate away on win/cancel
        viewLifecycleOwner.lifecycleScope.launch {
            gameViewModel.screenEvent.collect { screen ->
                if (screen == Screen.Win || screen == Screen.Cancel) {
                    navigateToScreen(screen)
                }
            }
        }

        // Observe detections and update UI buttons
        viewLifecycleOwner.lifecycleScope.launch {
            detectViewModel.detectedObjects.collectLatest { results ->
                updateObjectButtons(results)
            }
        }

        binding.btnCancelDetect.setOnClickListener {
            cancelGame()
        }

        checkCameraPermission()
    }

    private fun checkCameraPermission() {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.previewViewDetect.surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { analysis ->
                    analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                        val now = System.currentTimeMillis()
                        if (now - lastDetectionTime >= detectionIntervalMs) {
                            lastDetectionTime = now
                            val bitmap = imageProxy.toBitmap()
                            val results = objectDetectorHelper?.detect(bitmap) ?: emptyList()

                            handler.post {
                                if (_binding != null) {
                                    binding.overlayDetect.setResults(
                                        results,
                                        imageProxy.width,
                                        imageProxy.height,
                                        imageProxy.imageInfo.rotationDegrees
                                    )
                                    detectViewModel.updateDetections(results.take(6))
                                }
                            }
                        }
                        imageProxy.close()
                    }
                }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    viewLifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageAnalyzer
                )
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun updateObjectButtons(results: List<DetectionResult>) {
        binding.detectedObjectsContainer.removeAllViews()
        for (result in results) {
            val button = Button(requireContext()).apply {
                val swedishLabel = Translations.translate(result.label)
                val confidence = "%.0f".format(result.score * 100)
                text = "$swedishLabel ($confidence%)"
                setBackgroundColor(ContextCompat.getColor(requireContext(), R.color.accent))
                setTextColor(ContextCompat.getColor(requireContext(), R.color.background))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 8, 0, 8)
                }
                setPadding(24, 16, 24, 16)
                setOnClickListener {
                    selectObject(result)
                }
            }
            binding.detectedObjectsContainer.addView(button)
        }
    }

    private fun selectObject(result: DetectionResult) {
        val updates = JSONObject().apply {
            put("targetLabel", result.label)
            put("targetConfidence", result.score.toDouble())
        }
        gameViewModel.postUpdateGame(gameId, updates) { _ ->
            requireActivity().runOnUiThread {
                val bundle = Bundle().apply {
                    putString("gameId", gameId)
                    putString("myRole", myRole)
                }
                findNavController().navigate(R.id.action_detectFragment_to_waitFragment, bundle)
            }
        }
    }

    private fun navigateToScreen(screen: Screen) {
        val currentDest = findNavController().currentDestination?.id
        if (currentDest != R.id.detectFragment) return
        val bundle = Bundle().apply {
            putString("gameId", gameId)
            putString("myRole", myRole)
        }
        when (screen) {
            Screen.Win -> findNavController().navigate(R.id.action_detectFragment_to_winFragment, bundle)
            Screen.Cancel -> findNavController().navigate(R.id.action_detectFragment_to_cancelFragment, bundle)
            else -> {}
        }
    }

    private fun cancelGame() {
        val updates = JSONObject().apply {
            put("status", "canceled")
            put("canceledBy", myRole)
        }
        gameViewModel.postUpdateGame(gameId, updates) { _ ->
            requireActivity().runOnUiThread {
                val bundle = Bundle().apply {
                    putString("gameId", gameId)
                    putString("myRole", myRole)
                }
                findNavController().navigate(R.id.action_detectFragment_to_cancelFragment, bundle)
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cameraExecutor.shutdown()
        objectDetectorHelper?.close()
        objectDetectorHelper = null
        _binding = null
    }
}
