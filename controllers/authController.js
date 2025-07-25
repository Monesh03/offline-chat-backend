const db = require('../db'); // should already be db.promise()
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your_secret_key';

exports.loginUser = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password required' });
  }

  try {
    const [results] = await db.query('SELECT * FROM users WHERE identifier = ?', [identifier]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1d' });
    return res.status(200).json({ message: 'Login successful', token, name: user.name, identifier: user.identifier });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


exports.registerUser = async (req, res) => {
  const { name, identifier, password } = req.body;

  if (!name || !identifier || !password) {
    return res.status(400).json({ error: 'Name, identifier, and password are required' });
  }

  try {
    const [existing] = await db.query('SELECT * FROM users WHERE identifier = ?', [identifier]);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, identifier, password) VALUES (?, ?, ?)',
      [name, identifier, hashedPassword]
    );

    const token = jwt.sign({ userId: result.insertId }, JWT_SECRET, { expiresIn: '1d' });
    return res.status(201).json({ message: 'Registered successfully', token });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
