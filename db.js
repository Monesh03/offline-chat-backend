// db.js
const mysql = require('mysql2');

// ✅ Create a promise-based pool
const db = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'preethi@123',
  database: 'chat_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise(); // ✅ use promise wrapper

// ✅ Initialize tables
(async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ MySQL connected (via promise pool)');

    // USERS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        identifier VARCHAR(255) UNIQUE,
        password VARCHAR(255)
      )
    `);

    // CONVERSATIONS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user1 VARCHAR(255),
        user2 VARCHAR(255)
      )
    `);

    // MESSAGES
    await connection.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT,
        sender VARCHAR(255),
        text TEXT,
        timestamp DATETIME,
        attachment_url TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      )
    `);

    // GROUPS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`groups\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        admin VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // GROUP MEMBERS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT,
        member_identifier VARCHAR(20),
        FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE
      )
    `);

    // GROUP MESSAGES
    await connection.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT,
        sender VARCHAR(255),
        text TEXT,
        attachment_url TEXT,
        timestamp DATETIME
      )
    `);

    // CONTACTS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner VARCHAR(255),
        contact VARCHAR(255),
        name VARCHAR(255)
      )
    `);

    connection.release();
    console.log('✅ All tables initialized');
  } catch (err) {
    console.error('❌ Error initializing DB:', err.message);
  }
})();

module.exports = db;
