package com.hitta.app.ui.win

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.navigation.fragment.findNavController
import com.hitta.app.R
import com.hitta.app.databinding.FragmentWinBinding
import com.hitta.app.ui.GameViewModel

class WinFragment : Fragment() {

    private var _binding: FragmentWinBinding? = null
    private val binding get() = _binding!!

    private val gameViewModel: GameViewModel by activityViewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWinBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        gameViewModel.stopPolling()

        val game = gameViewModel.currentGame.value
        if (game != null) {
            binding.tvWinnerName.text = getString(R.string.winner_announcement, game.winner)
            binding.tvFinalScores.text = getString(
                R.string.final_scores,
                game.playerAName.ifBlank { "A" },
                game.playerAScore,
                game.playerBName.ifBlank { "B" },
                game.playerBScore
            )
        }

        binding.btnPlayAgain.setOnClickListener {
            findNavController().navigate(
                R.id.action_winFragment_to_homeFragment,
                null,
                androidx.navigation.NavOptions.Builder()
                    .setPopUpTo(R.id.nav_graph, true)
                    .build()
            )
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
