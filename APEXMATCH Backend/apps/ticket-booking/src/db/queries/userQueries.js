async function findUserById(connection, userId) {
  const [rows] = await connection.execute('SELECT id, name, email FROM users WHERE id = ?', [userId]);
  return rows[0] || null;
}

module.exports = { findUserById };
