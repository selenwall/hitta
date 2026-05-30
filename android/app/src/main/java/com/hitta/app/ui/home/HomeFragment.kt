package com.hitta.app.ui.home

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.RadioButton
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.navigation.fragment.findNavController
import com.hitta.app.Constants
import com.hitta.app.R
import com.hitta.app.databinding.FragmentHomeBinding
import com.hitta.app.model.Game
import com.hitta.app.ui.GameViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class HomeFragment : Fragment() {

    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!

    private val gameViewModel: GameViewModel by activityViewModels()

    private var gameId: String? = null
    private var inviteMode: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        gameId = arguments?.getString("gameId")
        inviteMode = arguments?.getBoolean("inviteMode", false) ?: false
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        if (inviteMode && !gameId.isNullOrBlank()) {
            showInviteMode()
        } else {
            showCreateMode()
        }
    }

    private fun showCreateMode() {
        binding.groupCreate.visibility = View.VISIBLE
        binding.groupInvite.visibility = View.GONE

        binding.btnCreateGame.setOnClickListener {
            val playerAName = binding.etPlayerAName.text.toString().trim()
            val playerBName = binding.etPlayerBName.text.toString().trim()

            if (playerAName.isEmpty()) {
                binding.etPlayerAName.error = getString(R.string.error_name_required)
                return@setOnClickListener
            }

            val winPoints = when (binding.rgWinPoints.checkedRadioButtonId) {
                R.id.rb1point -> 1
                R.id.rb3points -> 3
                else -> 5
            }

            val newGameId = ('a'..'z').plus('0'..'9').shuffled().take(8).joinToString("")
            val game = Game(
                status = "inviting",
                playerAName = playerAName,
                playerBName = playerBName,
                winPoints = winPoints,
                currentTurn = "A"
            )

            binding.btnCreateGame.isEnabled = false
            gameViewModel.postCreateGame(newGameId, game) { createdGame ->
                requireActivity().runOnUiThread {
                    // Save role
                    saveRole(newGameId, "A")

                    // Navigate to WaitFragment
                    val bundle = Bundle().apply {
                        putString("gameId", newGameId)
                        putString("myRole", "A")
                    }
                    findNavController().navigate(R.id.action_homeFragment_to_waitFragment, bundle)
                }
            }
        }

        binding.btnShareInvite.visibility = View.GONE
    }

    private fun showInviteMode() {
        binding.groupCreate.visibility = View.GONE
        binding.groupInvite.visibility = View.VISIBLE

        val gid = gameId!!

        // Fetch game to show player A name
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = com.hitta.app.api.ApiClient.getGame(gid)
                result.onSuccess { game ->
                    binding.tvInvitePlayerAName.text = getString(R.string.invite_player_a, game.playerAName)
                }.onFailure {
                    binding.tvInvitePlayerAName.text = getString(R.string.invite_player_a, "?")
                }
            } catch (e: Exception) {
                binding.tvInvitePlayerAName.text = getString(R.string.invite_player_a, "?")
            }
        }

        binding.btnJoinGame.setOnClickListener {
            val playerBName = binding.etInvitePlayerBName.text.toString().trim()
            if (playerBName.isEmpty()) {
                binding.etInvitePlayerBName.error = getString(R.string.error_name_required)
                return@setOnClickListener
            }

            binding.btnJoinGame.isEnabled = false
            val updates = org.json.JSONObject().apply {
                put("status", "accepted")
                put("playerBName", playerBName)
            }
            gameViewModel.postUpdateGame(gid, updates) { _ ->
                requireActivity().runOnUiThread {
                    saveRole(gid, "B")
                    val bundle = Bundle().apply {
                        putString("gameId", gid)
                        putString("myRole", "B")
                    }
                    findNavController().navigate(R.id.action_homeFragment_to_waitFragment, bundle)
                }
            }
        }
    }

    private fun shareInviteLink(gid: String) {
        val url = "${Constants.BASE_URL}?gid=$gid"
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, getString(R.string.share_invite_text, url))
        }
        startActivity(Intent.createChooser(shareIntent, getString(R.string.share_title)))
    }

    private fun saveRole(gid: String, role: String) {
        requireContext().getSharedPreferences("hitta", Context.MODE_PRIVATE)
            .edit()
            .putString("role_$gid", role)
            .apply()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
