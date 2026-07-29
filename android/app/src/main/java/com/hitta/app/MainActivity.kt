package com.hitta.app

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.navigation.NavController
import androidx.navigation.fragment.NavHostFragment
import com.hitta.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var navController: NavController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val navHostFragment =
            supportFragmentManager.findFragmentById(R.id.nav_host_fragment) as NavHostFragment
        navController = navHostFragment.navController

        // Handle deep link with ?gid= parameter
        handleIntent()
    }

    private fun handleIntent() {
        val data = intent?.data
        if (data != null) {
            val gameId = data.getQueryParameter("gid")
            if (!gameId.isNullOrBlank()) {
                val bundle = Bundle().apply {
                    putString("gameId", gameId)
                    putBoolean("inviteMode", true)
                }
                navController.navigate(R.id.homeFragment, bundle)
            }
        }
    }
}
