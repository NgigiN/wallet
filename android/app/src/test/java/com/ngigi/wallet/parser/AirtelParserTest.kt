package com.ngigi.wallet.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class AirtelParserTest {
    private val zone = ZoneId.of("Africa/Nairobi")
    private fun parse(body: String) = SmsParser.parse("airtelmoney", body, zone)

    @Test
    fun parsesPaidFormat24hFullYear() {
        val r = parse(
            "V3QHT5XTD1A. Ksh 40 paid to SAMPLE VENDOR LTD account 1234567 on 27/08/2026 08:00. " +
                "Fee Ksh 0. Bal:Ksh 175.0. MPESA ID:UHRS04XXX7"
        )
        val tx = r as ParseResult.Tx
        assertEquals("V3QHT5XTD1A", tx.txnId)
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(Source.AIRTEL, tx.source)
        assertEquals(40.0, tx.amount, 0.001)
        assertEquals(0.0, tx.cost, 0.001)
        assertEquals(175.0, tx.balance!!, 0.001)
        val expected = LocalDateTime.of(2026, 8, 27, 8, 0).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, tx.dateTimeMillis)
    }

    @Test
    fun parsesSentFormat12hShortYear() {
        val r = parse(
            "Y3QFOYKIPRY. Ksh 40 sent to Grace Akinyi 254700000000 on 25/08/26 at 07:01 PM. " +
                "Fee: Ksh 0. Bal: Ksh 215.0. MPESA ID: UHPHD4XXX4"
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(40.0, tx.amount, 0.001)
        val expected = LocalDateTime.of(2026, 8, 25, 19, 1).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, tx.dateTimeMillis)
    }

    @Test
    fun sameTxnIdInBothFormatsParsesToSameId() {
        val a = parse("V3QHT5XTD1A. Ksh 40 paid to SAMPLE VENDOR account 123 on 27/08/2026 08:00. Fee Ksh 0. Bal:Ksh 175.0. MPESA ID:UHRS04XXX7") as ParseResult.Tx
        val b = parse("V3QHT5XTD1A. Ksh 40 paid to Lipa Na Mpesa via Airtel Money on 27/08/26 at 08:00 AM. Fee: Ksh 0. Bal: Ksh 175.0. MPESA ID: UHRS04XXX7") as ParseResult.Tx
        assertEquals(a.txnId, b.txnId)
    }

    @Test
    fun ignoresPromosFromMoneySender() {
        val bodies = listOf(
            "Get 50% CASHBACK REWARD on transaction fees every time you transfer money from your bank account to Airtel Money. Use your bank's USSD code or app today!",
            "Congratulations! You have received KES 3.04  in your BONUS wallet. To check balance/ claim your bonus, Dial*334# > Option 98 or click https://example.com",
        )
        for (b in bodies) assertEquals("for: $b", ParseResult.Ignore, parse(b))
    }

    @Test
    fun transactionalLookingButUnknownAirtelFormatFails() {
        val r = parse("ZZ9AB12CD3E. Ksh 40 beamed to Somewhere on 25/08/26. Fee: Ksh 0.")
        assertTrue(r is ParseResult.Failed)
    }
}
