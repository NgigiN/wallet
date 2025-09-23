package mpesa

import (
	"testing"
)

func TestParseOutgoingVariants(t *testing.T) {
	cases := []struct {
		msg string
		id  string
	}{
		{`TIH5CRR635 Confirmed. Ksh65.00 paid to Anthony Wambua Muinde2. on 17/9/25 at 6:56 PM.New M-PESA balance is Ksh719.18. Transaction cost, Ksh0.00. Amount you can transact within the day is 498,760.00. Save frequent Tills for quick payment on M-PESA app https://bit.ly/mpesalnk`, "TIH5CRR635"},
		{`TIH6CSP6KA Confirmed. Ksh40.00 sent to Co-operative Bank Money Transfer for account 1082111 on 17/9/25 at 6:59 PM New M-PESA balance is Ksh679.18. Transaction cost, Ksh0.00.`, "TIH6CSP6KA"},
		{`TII5I5YNFP Confirmed. Ksh35.00 paid to FELIX MWENDWA KIKOLE. on 18/9/25 at 7:18 PM.New M-PESA balance is Ksh644.18. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,965.00. Save frequent Tills for quick payment on M-PESA app https://bit.ly/mpesalnk`, "TII5I5YNFP"},
		{`TII8I79A5O Confirmed. Ksh40.00 sent to Divinah  Nyabuto on 18/9/25 at 7:22 PM. New M-PESA balance is Ksh604.18. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,925.00. Sign up for Lipa Na M-PESA Till online https://m-pesaforbusiness.co.ke`, "TII8I79A5O"},
		{`TIJ9N9U6HT Confirmed. Ksh25.00 sent to Caroline  Mwania on 19/9/25 at 7:05 PM. New M-PESA balance is Ksh579.18. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,975.00. Sign up for Lipa Na M-PESA Till online https://m-pesaforbusiness.co.ke`, "TIJ9N9U6HT"},
	}

	for _, c := range cases {
		p, err := ParseMPesaMessage(c.msg)
		if err != nil {
			t.Fatalf("expected parse ok for %s, got err: %v", c.id, err)
		}
		if p.TransactionID != c.id {
			t.Fatalf("wrong id. want %s got %s", c.id, p.TransactionID)
		}
		if p.Amount <= 0 {
			t.Fatalf("expected positive amount for %s, got %f", c.id, p.Amount)
		}
	}
}
