package com.hitta.app.model

import org.json.JSONObject

data class Game(
    val status: String = "inviting",
    val playerAName: String = "",
    val playerBName: String = "",
    val playerAScore: Int = 0,
    val playerBScore: Int = 0,
    val currentTurn: String = "A",
    val targetLabel: String = "",
    val targetConfidence: Double = 0.0,
    val winPoints: Int = 5,
    val winner: String = "",
    val canceledBy: String = ""
) {
    companion object {
        fun fromJson(json: JSONObject): Game {
            return Game(
                status = json.optString("status", "inviting"),
                playerAName = json.optString("playerAName", ""),
                playerBName = json.optString("playerBName", ""),
                playerAScore = json.optInt("playerAScore", 0),
                playerBScore = json.optInt("playerBScore", 0),
                currentTurn = json.optString("currentTurn", "A"),
                targetLabel = json.optString("targetLabel", ""),
                targetConfidence = json.optDouble("targetConfidence", 0.0),
                winPoints = json.optInt("winPoints", 5),
                winner = json.optString("winner", ""),
                canceledBy = json.optString("canceledBy", "")
            )
        }
    }

    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("status", status)
            put("playerAName", playerAName)
            put("playerBName", playerBName)
            put("playerAScore", playerAScore)
            put("playerBScore", playerBScore)
            put("currentTurn", currentTurn)
            put("targetLabel", targetLabel)
            put("targetConfidence", targetConfidence)
            put("winPoints", winPoints)
            put("winner", winner)
            put("canceledBy", canceledBy)
        }
    }
}
