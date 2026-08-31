package com.ngigi.wallet.sync

import kotlinx.serialization.SerializationException
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.UnknownHostException

class HydrateErrorMessageTest {

    @Test
    fun wrongTokenNamesTheToken() {
        val msg = Hydrate.errorMessage(HttpException(401))
        assertTrue(msg, msg.contains("token", ignoreCase = true))
    }

    @Test
    fun unexpectedStatusNamesTheUrlAndCode() {
        val msg = Hydrate.errorMessage(HttpException(404))
        assertTrue(msg, msg.contains("404") && msg.contains("URL"))
    }

    @Test
    fun unknownHostNamesTheUrl() {
        val msg = Hydrate.errorMessage(UnknownHostException("no.such.host"))
        assertTrue(msg, msg.contains("URL"))
    }

    @Test
    fun nonJsonResponseNamesWrongServer() {
        val msg = Hydrate.errorMessage(SerializationException("bad json"))
        assertTrue(msg, msg.contains("wallet server", ignoreCase = true))
    }

    @Test
    fun genericNetworkFailureNamesConnection() {
        val msg = Hydrate.errorMessage(IOException("timeout"))
        assertTrue(msg, msg.contains("connection", ignoreCase = true))
    }
}
