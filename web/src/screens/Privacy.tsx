export function Privacy() {
  return (
    <div className="shell-main">
      <div className="hero"><div className="dim">Wallet</div><div className="big">Privacy</div></div>
      <div className="card">
        <h3>What Wallet stores</h3>
        <p>For each transaction: the amount, fee, the counterparty name or till as it appears in your M-PESA or Airtel message, the receipt code, the date, your account balance after the transaction if the message included it, and the category and note you add. It also stores your categories, budgets, auto-tag rules, your email and name, and a list of the devices you have signed in from.</p>
        <h3>What it does not store</h3>
        <p>The text of your SMS messages never leaves your phone. Wallet does not store your phone number, contacts, or location.</p>
        <h3>Who can see it</h3>
        <p>You, and anyone you invite into a shared space. The person running the service can access the database for maintenance and backups and does not look at individual transactions.</p>
        <h3>How long it is kept</h3>
        <p>Until you delete a transaction, or delete your account. Encrypted backups are kept for 30 days, monthly copies for 6 months.</p>
        <h3>Contact</h3>
        <p>Questions or deletion requests: message the person who invited you, or email the address on the sign-in page.</p>
      </div>
    </div>
  );
}
