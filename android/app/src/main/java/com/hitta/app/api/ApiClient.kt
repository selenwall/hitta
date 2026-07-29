package com.hitta.app.api

import com.hitta.app.Constants
import com.hitta.app.model.Game
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ApiClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun apiUrl(gameId: String) = "${Constants.BASE_URL}/api/game?id=$gameId"

    suspend fun getGame(gameId: String): Result<Game> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(apiUrl(gameId))
                .get()
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val body = response.body?.string() ?: return@withContext Result.failure(
                    Exception("Empty response body")
                )
                val json = JSONObject(body)
                Result.success(Game.fromJson(json))
            } else {
                Result.failure(Exception("HTTP ${response.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createGame(gameId: String, game: Game): Result<Game> = withContext(Dispatchers.IO) {
        try {
            val body = game.toJson().toString().toRequestBody(JSON_MEDIA_TYPE)
            val request = Request.Builder()
                .url(apiUrl(gameId))
                .post(body)
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val responseBody = response.body?.string() ?: return@withContext Result.failure(
                    Exception("Empty response body")
                )
                val json = JSONObject(responseBody)
                Result.success(Game.fromJson(json))
            } else {
                Result.failure(Exception("HTTP ${response.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateGame(gameId: String, updates: JSONObject): Result<Game> =
        withContext(Dispatchers.IO) {
            try {
                val body = updates.toString().toRequestBody(JSON_MEDIA_TYPE)
                val request = Request.Builder()
                    .url(apiUrl(gameId))
                    .patch(body)
                    .build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val responseBody = response.body?.string() ?: return@withContext Result.failure(
                        Exception("Empty response body")
                    )
                    val json = JSONObject(responseBody)
                    Result.success(Game.fromJson(json))
                } else {
                    Result.failure(Exception("HTTP ${response.code}"))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
}
