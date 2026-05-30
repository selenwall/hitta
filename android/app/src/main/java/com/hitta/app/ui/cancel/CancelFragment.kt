package com.hitta.app.ui.cancel

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.navigation.fragment.findNavController
import com.hitta.app.R
import com.hitta.app.databinding.FragmentCancelBinding
import com.hitta.app.ui.GameViewModel

class CancelFragment : Fragment() {

    private var _binding: FragmentCancelBinding? = null
    private val binding get() = _binding!!

    private val gameViewModel: GameViewModel by activityViewModels()

    private var myRole: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        myRole = arguments?.getString("myRole") ?: ""
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCancelBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        gameViewModel.stopPolling()

        val game = gameViewModel.currentGame.value
        val cancelMessage = if (game != null && game.canceledBy.isNotBlank()) {
            val cancelerName = if (game.canceledBy == "A") game.playerAName else game.playerBName
            getString(R.string.canceled_by, cancelerName.ifBlank { game.canceledBy })
        } else {
            getString(R.string.game_canceled)
        }

        binding.tvCancelMessage.text = cancelMessage

        binding.btnBackHome.setOnClickListener {
            findNavController().navigate(
                R.id.action_cancelFragment_to_homeFragment,
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
