package com.hitta.app.ui.wait

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hitta.app.R
import com.hitta.app.databinding.FragmentWaitBinding
import com.hitta.app.model.Game
import com.hitta.app.ui.GameViewModel
import com.hitta.app.ui.Screen
import com.hitta.app.util.Translations
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.json.JSONObject

class WaitFragment : Fragment() {

    private var _binding: FragmentWaitBinding? = null
    private val binding get() = _binding!!

    private val gameViewModel: GameViewModel by activityViewModels()

    private var gameId: String = ""
    private var myRole: String = ""

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
        _binding = FragmentWaitBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Start polling
        gameViewModel.startPolling(gameId, myRole)

        // Observe game state for UI updates
        viewLifecycleOwner.lifecycleScope.launch {
            gameViewModel.currentGame.collectLatest { game ->
                if (game != null) {
                    updateUI(game)
                }
            }
        }

        // Observe screen routing events
        viewLifecycleOwner.lifecycleScope.launch {
            gameViewModel.screenEvent.collect { screen ->
                navigateToScreen(screen)
            }
        }

        binding.btnCancel.setOnClickListener {
            cancelGame()
        }

        binding.btnStartGame.setOnClickListener {
            startGame()
        }
    }

    private fun updateUI(game: Game) {
        binding.btnStartGame.visibility = View.GONE

        val message = when {
            game.status == "inviting" && myRole == "A" -> {
                val name = if (game.playerBName.isBlank()) getString(R.string.player_b) else game.playerBName
                getString(R.string.wait_inviting_a, name)
            }
            game.status == "inviting" && myRole == "B" -> {
                getString(R.string.wait_inviting_b)
            }
            game.status == "accepted" && myRole == "A" -> {
                binding.btnStartGame.visibility = View.VISIBLE
                getString(R.string.wait_accepted_a)
            }
            game.status == "accepted" && myRole == "B" -> {
                getString(R.string.wait_accepted_b, game.playerAName)
            }
            game.status == "playing" -> {
                val isChallenger = game.currentTurn == myRole
                val finderRole = if (game.currentTurn == "A") "B" else "A"
                val challengerName = if (game.currentTurn == "A") game.playerAName else game.playerBName
                val finderName = if (finderRole == "A") game.playerAName else game.playerBName
                when {
                    game.targetLabel.isNotEmpty() && isChallenger -> {
                        val swedishLabel = Translations.translate(game.targetLabel)
                        getString(R.string.wait_playing_challenger, finderName, swedishLabel)
                    }
                    game.targetLabel.isEmpty() && !isChallenger -> {
                        getString(R.string.wait_playing_finder, challengerName)
                    }
                    else -> getString(R.string.wait_generic)
                }
            }
            else -> getString(R.string.wait_generic)
        }

        binding.tvWaitMessage.text = message

        // Update score display
        binding.tvScores.text = getString(
            R.string.score_display,
            game.playerAName.ifBlank { "A" },
            game.playerAScore,
            game.playerBName.ifBlank { "B" },
            game.playerBScore
        )
    }

    private fun navigateToScreen(screen: Screen) {
        val currentDestination = findNavController().currentDestination?.id
        if (currentDestination != R.id.waitFragment) return

        val bundle = Bundle().apply {
            putString("gameId", gameId)
            putString("myRole", myRole)
        }

        when (screen) {
            Screen.Detect -> findNavController().navigate(R.id.action_waitFragment_to_detectFragment, bundle)
            Screen.Play -> findNavController().navigate(R.id.action_waitFragment_to_playFragment, bundle)
            Screen.Win -> findNavController().navigate(R.id.action_waitFragment_to_winFragment, bundle)
            Screen.Cancel -> findNavController().navigate(R.id.action_waitFragment_to_cancelFragment, bundle)
            Screen.Wait -> { /* stay */ }
            Screen.Home -> findNavController().navigate(R.id.action_waitFragment_to_homeFragment)
        }
    }

    private fun startGame() {
        val updates = JSONObject().apply {
            put("status", "playing")
        }
        gameViewModel.postUpdateGame(gameId, updates)
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
                findNavController().navigate(R.id.action_waitFragment_to_cancelFragment, bundle)
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
