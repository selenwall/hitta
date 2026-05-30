package com.hitta.app.ui.play

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.CountDownTimer
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
import com.hitta.app.Constants
import com.hitta.app.R
import com.hitta.app.databinding.FragmentPlayBinding
import com.hitta.app.detector.DetectionResult
import com.hitta.app.detector.ObjectDetectorHelper
import com.hitta.app.model.Game
import com.hitta.app.ui.GameViewModel
import com.hitta.app.ui.Screen
import com.hitta.app.util.Translations
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class PlayFragment : Fragment() {

    private var _binding: FragmentPlayBinding? = null
    private val binding get() = _binding!!

    private val gameViewModel: GameViewModel by activityViewModels()
    private val playViewModel: PlayViewModel by viewModels()

    private var gameId: String = ""
    private var myRole: String = ""

    private lateinit var cameraExecutor: ExecutorService
    private var objectDetectorHelper: ObjectDetectorHelper? = null
    private val handler = Handler(Looper.getMainLooper())
    private var lastDetectionTime = 0L
    private val detectionIntervalMs = 600L

    private var countDownTimer: CountDownTimer? = null
    private var gameFinished = false

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
        _binding = FragmentPlayBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        cameraExecutor = Executors.newSingleThreadExecutor()
        objectDetectorHelper = ObjectDetectorHelper(requireContext()).also { it.setup() }

        // Show target label
        val currentGame = gameViewModel.currentGame.value
        if (currentGame != null) {
            updateTargetDisplay(currentGame)
        }

        // Observe game changes for target label
        viewLifecycleOwner.lifecycleScope.launch {
            gameViewModel.currentGame.collectLatest { game ->
                if (game != null && _binding != null) {
                    updateTargetDisplay(game)
                }
            }
        }

        // Observe screen events — only navigate on win/cancel
        viewLifecycleOwner.lifecycleScope.launch {
            gameViewModel.screenEvent.collect { screen ->
                if (screen == Screen.Win || screen == Screen.Cancel) {
                    navigateToScreen(screen)
                }
            }
        }

        // Observe detections
        viewLifecycleOwner.lifecycleScope.launch {
            playViewModel.detectedObjects.collectLatest { results ->
                updateObjectButtons(results)
            }
        }

        // Observe timer
        viewLifecycleOwner.lifecycleScope.launch {
            playViewModel.timeLeft.collectLatest { seconds ->
                if (_binding != null) {
                    binding.tvTimer.text = getString(R.string.timer_format, seconds)
                }
            }
        }

        startCountDown()

        binding.btnGiveUp.setOnClickListener {
            giveUp()
        }

        checkCameraPermission()
    }

    private fun updateTargetDisplay(game: Game) {
        val swedishLabel = Translations.translate(game.targetLabel)
        binding.tvTargetLabel.text = getString(R.string.find_object, swedishLabel)
        binding.tvScoresPlay.text = getString(
            R.string.score_display,
            game.playerAName.ifBlank { "A" },
            game.playerAScore,
            game.playerBName.ifBlank { "B" },
            game.playerBScore
        )
    }

    private fun startCountDown() {
        countDownTimer?.cancel()
        countDownTimer = object : CountDownTimer(Constants.TURN_SECONDS * 1000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                val secondsLeft = (millisUntilFinished / 1000).toInt()
                playViewModel.setTimeLeft(secondsLeft)
            }

            override fun onFinish() {
                playViewModel.setTimeLeft(0)
                if (!gameFinished) {
                    onTimeUp()
                }
            }
        }.start()
    }

    private fun onTimeUp() {
        val game = gameViewModel.currentGame.value ?: return
        submitResult(game, found = false)
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
                it.setSurfaceProvider(binding.previewViewPlay.surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { analysis ->
                    analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                        val now = System.currentTimeMillis()
                        if (now - lastDetectionTime >= detectionIntervalMs && !gameFinished) {
                            lastDetectionTime = now
                            val bitmap = imageProxy.toBitmap()
                            val results = objectDetectorHelper?.detect(bitmap) ?: emptyList()

                            handler.post {
                                if (_binding != null) {
                                    binding.overlayPlay.setResults(
                                        results,
                                        imageProxy.width,
                                        imageProxy.height,
                                        imageProxy.imageInfo.rotationDegrees
                                    )
                                    playViewModel.updateDetections(results.take(6))
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
        if (_binding == null) return
        binding.detectedObjectsPlayContainer.removeAllViews()
        val game = gameViewModel.currentGame.value ?: return

        for (result in results) {
            val button = Button(requireContext()).apply {
                val swedishLabel = Translations.translate(result.label)
                val confidence = "%.0f".format(result.score * 100)
                text = "$swedishLabel ($confidence%)"

                // Highlight if this matches the target
                val isMatch = result.label.equals(game.targetLabel, ignoreCase = true)
                if (isMatch) {
                    setBackgroundColor(ContextCompat.getColor(requireContext(), R.color.accent))
                    setTextColor(ContextCompat.getColor(requireContext(), R.color.background))
                } else {
                    setBackgroundColor(ContextCompat.getColor(requireContext(), R.color.surface))
                    setTextColor(ContextCompat.getColor(requireContext(), R.color.foreground))
                }

                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 8, 0, 8)
                }
                setPadding(24, 16, 24, 16)

                setOnClickListener {
                    if (isMatch && !gameFinished) {
                        gameFinished = true
                        countDownTimer?.cancel()
                        submitResult(game, found = true)
                    }
                }
            }
            binding.detectedObjectsPlayContainer.addView(button)
        }
    }

    private fun submitResult(game: Game, found: Boolean) {
        val finderRole = if (game.currentTurn == "A") "B" else "A"
        val newAScore = game.playerAScore + if (found && finderRole == "A") 1 else 0
        val newBScore = game.playerBScore + if (found && finderRole == "B") 1 else 0
        val nextTurn = if (game.currentTurn == "A") "B" else "A"
        val won = newAScore >= game.winPoints || newBScore >= game.winPoints
        val winnerName = if (newAScore >= game.winPoints) game.playerAName else game.playerBName

        val updates = JSONObject().apply {
            put("playerAScore", newAScore)
            put("playerBScore", newBScore)
            put("targetLabel", "")
            put("targetConfidence", 0.0)
            put("currentTurn", nextTurn)
            if (won) {
                put("status", "won")
                put("winner", winnerName)
            }
        }

        gameViewModel.postUpdateGame(gameId, updates) { updatedGame ->
            requireActivity().runOnUiThread {
                val bundle = Bundle().apply {
                    putString("gameId", gameId)
                    putString("myRole", myRole)
                }
                if (won) {
                    findNavController().navigate(R.id.action_playFragment_to_winFragment, bundle)
                } else {
                    findNavController().navigate(R.id.action_playFragment_to_waitFragment, bundle)
                }
            }
        }
    }

    private fun giveUp() {
        val game = gameViewModel.currentGame.value ?: return
        if (!gameFinished) {
            gameFinished = true
            countDownTimer?.cancel()
            submitResult(game, found = false)
        }
    }

    private fun navigateToScreen(screen: Screen) {
        val currentDest = findNavController().currentDestination?.id
        if (currentDest != R.id.playFragment) return
        val bundle = Bundle().apply {
            putString("gameId", gameId)
            putString("myRole", myRole)
        }
        when (screen) {
            Screen.Win -> findNavController().navigate(R.id.action_playFragment_to_winFragment, bundle)
            Screen.Cancel -> findNavController().navigate(R.id.action_playFragment_to_cancelFragment, bundle)
            else -> {}
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        countDownTimer?.cancel()
        cameraExecutor.shutdown()
        objectDetectorHelper?.close()
        objectDetectorHelper = null
        _binding = null
    }
}
