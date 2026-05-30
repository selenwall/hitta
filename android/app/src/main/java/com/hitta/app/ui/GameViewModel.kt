package com.hitta.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hitta.app.api.ApiClient
import com.hitta.app.model.Game
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import com.hitta.app.Constants

enum class Screen {
    Home, Wait, Detect, Play, Win, Cancel
}

class GameViewModel : ViewModel() {

    private val _currentGame = MutableStateFlow<Game?>(null)
    val currentGame: StateFlow<Game?> = _currentGame.asStateFlow()

    private val _screenEvent = MutableSharedFlow<Screen>(extraBufferCapacity = 1)
    val screenEvent: SharedFlow<Screen> = _screenEvent.asSharedFlow()

    private val _error = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val error: SharedFlow<String> = _error.asSharedFlow()

    private var pollingJob: Job? = null
    private var currentGameId: String? = null

    fun startPolling(gameId: String, myRole: String) {
        if (pollingJob?.isActive == true && currentGameId == gameId) return
        currentGameId = gameId
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (true) {
                fetchGame(gameId, myRole)
                delay(Constants.POLL_INTERVAL_MS)
            }
        }
    }

    fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }

    private suspend fun fetchGame(gameId: String, myRole: String) {
        val result = ApiClient.getGame(gameId)
        result.onSuccess { game ->
            _currentGame.value = game
            val screen = computeTargetScreen(game, myRole)
            _screenEvent.tryEmit(screen)
        }.onFailure { e ->
            _error.tryEmit(e.message ?: "Okänt fel")
        }
    }

    fun computeTargetScreen(game: Game, myRole: String): Screen {
        return when {
            game.status == "won" -> Screen.Win
            game.status == "canceled" -> Screen.Cancel
            game.status == "playing" -> {
                val isChallenger = game.currentTurn == myRole
                when {
                    game.targetLabel.isEmpty() && isChallenger -> Screen.Detect
                    game.targetLabel.isEmpty() && !isChallenger -> Screen.Wait
                    game.targetLabel.isNotEmpty() && isChallenger -> Screen.Wait
                    game.targetLabel.isNotEmpty() && !isChallenger -> Screen.Play
                    else -> Screen.Wait
                }
            }
            game.status == "accepted" -> Screen.Wait
            game.status == "inviting" && myRole == "A" -> Screen.Wait
            game.status == "inviting" && myRole == "B" -> Screen.Home
            else -> Screen.Wait
        }
    }

    fun postUpdateGame(gameId: String, updates: JSONObject, onSuccess: ((Game) -> Unit)? = null) {
        viewModelScope.launch {
            val result = ApiClient.updateGame(gameId, updates)
            result.onSuccess { game ->
                _currentGame.value = game
                onSuccess?.invoke(game)
            }.onFailure { e ->
                _error.tryEmit(e.message ?: "Okänt fel")
            }
        }
    }

    fun postCreateGame(gameId: String, game: Game, onSuccess: ((Game) -> Unit)? = null) {
        viewModelScope.launch {
            val result = ApiClient.createGame(gameId, game)
            result.onSuccess { createdGame ->
                _currentGame.value = createdGame
                onSuccess?.invoke(createdGame)
            }.onFailure { e ->
                _error.tryEmit(e.message ?: "Okänt fel")
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopPolling()
    }
}
