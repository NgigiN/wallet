package com.ngigi.wallet.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class MpesaVariantsParserTest {
    private val zone = ZoneId.of("Africa/Nairobi")
    private fun parse(body: String) = SmsParser.parse("MPESA", body, zone)

    @Test
    fun parsesReceivedWithViaSuffixAndLowercaseConfirmed() {
        val r = parse(
            "UHRDS4LTFU confirmed. You have received Ksh374.00 from Peter Kamau Njoroge in FR via EQT " +
                "on 27/8/26 at 8:13 PM. New M-PESA balance is Ksh11,012.18."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.IN, tx.direction)
        assertEquals("Peter Kamau Njoroge", tx.counterparty)
        assertEquals(374.0, tx.amount, 0.001)
        assertEquals(0.0, tx.cost, 0.001)
    }

    @Test
    fun parsesReceivedWithMaskedPhoneAndNoSpaceAfterConfirmed() {
        val r = parse(
            "UHRQB432RV Confirmed.You have received Ksh360.00 from MARY  ATIENO 0711***155 on 27/8/26 " +
                "at 2:47 PM  New M-PESA balance is Ksh10,945.18. Invest & earn daily interest with ZIIDI on https://example.com"
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.IN, tx.direction)
        assertEquals("MARY ATIENO", tx.counterparty)
    }

    @Test
    fun parsesReceivedIntoBusinessBalance() {
        val r = parse(
            "UEKQB4R7LG Confirmed.You have received Ksh500.00 from MARY  ATIENO on 20/5/26 at 8:51 PM  " +
                "New business balance is Ksh41,488.00. To access your funds, Dial *334#,select Pochi la Biashara & Withdraw funds."
        )
        assertEquals(Direction.IN, (r as ParseResult.Tx).direction)
    }

    @Test
    fun parsesAgentWithdrawWithDateBeforeVerb() {
        val r = parse(
            "UHADS2L7OQ Confirmed.on 10/8/26 at 2:25 PMWithdraw Ksh5,000.00 from 448431 - Acme Agencies Ltd Sample Mall " +
                "New M-PESA balance is Ksh622.18. Transaction cost, Ksh69.00. Amount you can transact within the day is 494,800.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(5000.0, tx.amount, 0.001)
        assertEquals(69.0, tx.cost, 0.001)
        assertTrue(tx.counterparty.startsWith("448431"))
    }

    @Test
    fun parsesPochiMoveAsTransfer() {
        val r = parse(
            "UHUDS4XKO7 Confirmed, Ksh8,000.00 has been moved from your M-PESA account to your Pochi account " +
                "on 30/8/26 at 6:29 PM.. New Pochi balance is Ksh8,016.00. New M-PESA balance is Ksh1,494.18. Transaction cost, Ksh0.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.TRANSFER, tx.direction)
        assertEquals(8000.0, tx.amount, 0.001)
    }

    @Test
    fun ignoresNonTransactionalMessages() {
        val bodies = listOf(
            "Transaction failed. The format of your account number is incorrect. Please check and try again with the correct format of your account number.",
            "Insufficient funds in your M-PESA account for this transaction, to register for Fuliza M-PESA service, Dial *334#OK",
            "The number you are trying to pay has not joined the service. Kindly ask the recipient to dial *334# and select Pochi la Biashara to Join.",
        )
        for (b in bodies) assertEquals("for: $b", ParseResult.Ignore, parse(b))
    }

    @Test
    fun transactionalLookingButUnknownFormatFails() {
        val r = parse("UXXXX1 Confirmed. Ksh50.00 teleported to Nowhere on 1/1/26 at 1:00 PM.")
        assertTrue(r is ParseResult.Failed)
    }
}
