export async function getWalletBalance(pool, userId) {
  const result = await pool.query(
    "SELECT user_id, balance FROM wallets WHERE user_id = $1",
    [userId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Wallet not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
}

export async function addDemoFunds(pool, { userId, amount }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const wallet = await client.query(
      "SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    if (wallet.rowCount === 0) {
      const error = new Error("Wallet not found");
      error.statusCode = 404;
      throw error;
    }

    const updatedWallet = await client.query(
      "UPDATE wallets SET balance = balance + $1 WHERE id = $2 RETURNING user_id, balance",
      [amount, wallet.rows[0].id]
    );
    const transaction = await client.query(
      `INSERT INTO wallet_transactions (wallet_id, amount, transaction_type)
       VALUES ($1, $2, 'credit')
       RETURNING id, amount, transaction_type, transaction_date`,
      [wallet.rows[0].id, amount]
    );

    await client.query("COMMIT");
    return { wallet: updatedWallet.rows[0], transaction: transaction.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}