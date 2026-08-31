package com.ngigi.wallet.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class MpesaOutParserTest {
    private val zone = ZoneId.of("Africa/Nairobi")

    private fun parse(body: String) = SmsParser.parse("MPESA", body, zone)

    @Test
    fun parsesSentTo() {
        val r = parse(
            "TID60759AQ Confirmed. Ksh300.00 sent to Jane Wanjiku on 13/9/26 at 9:24 AM. " +
                "New M-PESA balance is Ksh1,761.18. Transaction cost, Ksh7.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals("TID60759AQ", tx.txnId)
        assertEquals(300.0, tx.amount, 0.001)
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(Source.MPESA, tx.source)
        assertEquals("Jane Wanjiku", tx.counterparty)
        assertEquals(1761.18, tx.balance!!, 0.001)
        assertEquals(7.0, tx.cost, 0.001)
        val expected = LocalDateTime.of(2026, 9, 13, 9, 24).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, tx.dateTimeMillis)
    }

    @Test
    fun parsesPaidToWithNoSpaceBeforeAmPm() {
        val r = parse(
            "TIL4XR5BBM Confirmed. Ksh25.00 paid to Acme Waters. on 21/9/26 at 7:00PM. " +
                "New M-PESA balance is Ksh164.18. Transaction cost, Ksh0.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.OUT, tx.direction)
        assertEquals("Acme Waters", tx.counterparty)
        assertEquals(25.0, tx.amount, 0.001)
    }

    @Test
    fun parsesBusinessBalanceVariant() {
        val r = parse(
            "TIL7XUOPX7 Confirmed. Ksh80.00 sent to John Otieno on 21/9/26 at 7:13 PM. " +
                "New business balance is Ksh44.18. Transaction cost, Ksh0.00."
        )
        assertTrue(r is ParseResult.Tx)
    }

    @Test
    fun unknownSenderIsIgnored() {
        assertEquals(ParseResult.Ignore, SmsParser.parse("RandomShop", "Ksh100 sent to you", zone))
    }
}
