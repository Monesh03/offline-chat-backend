const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const db = require('./db'); 
const authRoutes = require('./routes/authRoutes'); 

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ======================== DATABASE ========================


// ======================== MIDDLEWARE ========================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', authRoutes);



const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ======================== HELPERS ========================
const getISTTimestamp = () => {
  const raw = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false
  }).replace(',', '');
  const [month, day, rest] = raw.split('/');
  const [year, time] = rest.split(' ');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${time}`;
};

const userSockets = new Map();

// ======================== USER LIMIT CONFIG ========================
const MAX_CONCURRENT_USERS = 50;
const activeSocketUsers = new Map(); // Track active socket connections: identifier -> socketId


// ======================== ROUTES ========================

// ✅ Get server status and user count
app.get('/server-status', (_, res) => {
  res.json({
    currentUsers: activeSocketUsers.size,
    maxUsers: MAX_CONCURRENT_USERS,
    available: activeSocketUsers.size < MAX_CONCURRENT_USERS,
    onlineUsers: Array.from(activeSocketUsers.keys())
  });
});

// ✅ Get all users
app.get('/users', async (_, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM users`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get online users
app.get('/online-users', async (_, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM users`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ Upload file
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `http://localhost:8000/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// ✅ Upload base64
app.post('/upload-base64', (req, res) => {
  const { name, mimeType, base64 } = req.body;
  if (!name || !base64) return res.status(400).json({ error: 'Missing data' });

  const ext = mimeType?.split('/')[1] || 'bin';
  const filename = `${Date.now()}-${name}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
  const url = `http://localhost:8000/uploads/${filename}`;
  res.json({ url });
});

// ✅ Fetch all messages
app.get('/messages', async (req, res) => {
  const query = `
    SELECT m.conversation_id, m.sender, m.text, m.timestamp, m.attachment_url,
           c.user1, c.user2
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    ORDER BY m.conversation_id, m.id
  `;

  try {
    const [rows] = await db.query(query);

    const conversationMap = {};
    rows.forEach(row => {
      const { conversation_id, sender, text, timestamp, attachment_url, user1, user2 } = row;

      if (!conversationMap[conversation_id]) {
        conversationMap[conversation_id] = {
          id: conversation_id,
          sender: user1,
          receiver: user2,
          conversation: [],
          "created timestamp": timestamp,
          "updated timestamp": timestamp
        };
      }

      conversationMap[conversation_id].conversation.push({
        from: sender,
        text,
        timestamp,
        attachment_url
      });

      conversationMap[conversation_id]["updated timestamp"] = timestamp;
    });

    res.json(Object.values(conversationMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete conversation
// app.post('/delete-conversation', async (req, res) => {u
//   const { user1, user2 } = req.body;
//   if (!user1 || !user2) return res.status(400).json({ error: 'Missing users' });

//   try {
//     const [results] = await db.query(`
//       SELECT id FROM conversations
//       WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)
//     `, [user1, user2, user2, user1]);

//     if (results.length === 0) return res.status(404).json({ error: 'Conversation not found' });

//     const conversationId = results[0].id;

//     await db.query(`DELETE FROM messages WHERE conversation_id = ?`, [conversationId]);
//     await db.query(`DELETE FROM conversations WHERE id = ?`, [conversationId]);

//     res.json({ success: true });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });


// ✅ Add contact
app.post('/add-contact', async (req, res) => {
  const { owner, contact, name } = req.body;

  console.log('📩 Add Contact Request:', { owner, contact, name });

  if (!owner || !contact || !name) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Step 1: Check if contact exists
    const [users] = await db.query('SELECT * FROM users WHERE identifier = ?', [contact]);

    if (users.length === 0) {
      console.log('❌ Contact not registered:', contact);
      return res.status(404).json({ error: 'Contact not registered' });
    }

    // Step 2: Check if already added
    const [existing] = await db.query(
      'SELECT * FROM contacts WHERE owner = ? AND contact = ?',
      [owner, contact]
    );

    if (existing.length > 0) {
      console.log('⚠️ Contact already exists:', contact);
      return res.json({ message: 'Already added' });
    }

    // Step 3: Add contact
    await db.query(
      'INSERT INTO contacts (owner, contact, name) VALUES (?, ?, ?)',
      [owner, contact, name]
    );

    console.log('✅ Contact added:', { owner, contact, name });
    return res.json({ success: true });

  } catch (err) {
    console.error('❌ DB error:', err.message);
    return res.status(500).json({ error: 'DB error' });
  }
});




// ✅ Get contacts
app.get('/contacts/:owner', async (req, res) => {
  const { owner } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT contact, name FROM contacts WHERE owner = ?',
      [owner]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete contact
app.post('/delete-contact', async (req, res) => {
  const { owner, contact } = req.body;
  try {
    await db.query('DELETE FROM contacts WHERE owner = ? AND contact = ?', [owner, contact]);
    res.json({ success: true });
  } catch (err) {
    res.json({ error: 'DB error' });
  }
});

//groups
app.post('/create-group', async (req, res) => {
  const { name, admin } = req.body;

  if (!name || !admin) {
    return res.status(400).json({ success: false, message: 'Missing name or admin' });
  }

  try {
    const [result] = await db.query('INSERT INTO `groups` (name, admin) VALUES (?, ?)', [name, admin]);
    res.json({ success: true, groupId: result.insertId });
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});


// ✅ Fetch groups where user is a member or admin
app.get('/groups/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [results] = await db.query(`
      SELECT g.id, g.name, g.admin, g.created_at
      FROM \`groups\` g
      LEFT JOIN \`group_members\` gm ON g.id = gm.group_id
      WHERE g.admin = ? OR gm.member_identifier = ?
      GROUP BY g.id
    `, [userId, userId]);

    res.json(results);
  } catch (err) {
    console.error('❌ SQL ERROR in /groups/:userId:', err.message);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});





app.get('/group-members/:groupId', async (req, res) => {
  const { groupId } = req.params;

  try {
    const [rows] = await db.query('SELECT member_identifier FROM group_members WHERE group_id = ?', [groupId]);
    res.json(rows.map(r => r.member_identifier));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// Save group message to DB
app.post('/group-messages', async (req, res) => {
  const { groupId, from, text, attachment_url, timestamp } = req.body;

  if (!groupId || !from || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await db.query(
      `INSERT INTO group_messages (group_id, sender, text, attachment_url, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [groupId, from, text || null, attachment_url || null, timestamp]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to insert group message:', err);
    res.status(500).json({ error: 'Database insert error' });
  }
});



// Fetch group messages
app.get('/group-messages/:groupId', async (req, res) => {
  const groupId = req.params.groupId;

  try {
    const [results] = await db.query(
      'SELECT * FROM group_messages WHERE group_id = ? ORDER BY timestamp ASC',
      [groupId]
    );
    res.json(results);
  } catch (err) {
    console.error('❌ Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch group messages' });
  }
});


// Get group info (members and admin)
app.get('/group-info/:groupId', async (req, res) => {
  const groupId = req.params.groupId;

  try {
    // Get group admin and name
    const [groupRes] = await db.query('SELECT admin, name FROM `groups` WHERE id = ?', [groupId]);
    if (groupRes.length === 0) return res.status(404).json({ error: 'Group not found' });

    const group = groupRes[0];

    // Get members from group_members
    const [membersRes] = await db.query(
      'SELECT member_identifier FROM group_members WHERE group_id = ?',
      [groupId]
    );

    const memberSet = new Set(membersRes.map(m => m.member_identifier));
    memberSet.add(group.admin); // Ensure admin is included once

    const uniqueMembers = Array.from(memberSet);
    res.json({ admin: group.admin, name: group.name, members: uniqueMembers });
  } catch (err) {
    console.error('❌ Error fetching group info:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/add-group-member', async (req, res) => {
  const { groupId, member } = req.body;
  console.log('Received groupId:', groupId);
  console.log('Received member:', member);

  if (!groupId || !member) {
    return res.status(400).json({ success: false, message: 'Missing data' });
  }

  try {
    // ✅ Check if member already exists
    const [existing] = await db.query(
      'SELECT * FROM group_members WHERE group_id = ? AND member_identifier = ?',
      [groupId, member]
    );

    if (existing.length > 0) {
      return res.json({ success: false, message: 'Member already exists' });
    }

    // ✅ Insert new member
    await db.query(
      'INSERT INTO group_members (group_id, member_identifier) VALUES (?, ?)',
      [groupId, member]
    );

    console.log('✅ Member added:', member);
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ SQL Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});




// ======================== SOCKET.IO ========================
io.on('connection', (socket) => {

  // ✅ Handle user registration with limit check
  socket.on('registerUser', (identifier) => {
    if (!identifier) return;

    // Check if user is already connected via socket (allow reconnection from same user)
    if (activeSocketUsers.has(identifier)) {
      // Update socket ID for existing user (reconnection)
      activeSocketUsers.set(identifier, socket.id);
      socket.emit('registrationStatus', { success: true, message: 'Reconnected successfully' });
      socket.userId = identifier;
      io.emit('onlineUsers', Array.from(activeSocketUsers.keys()));
      console.log(`🔄 User ${identifier} reconnected. Active socket users: ${activeSocketUsers.size}/${MAX_CONCURRENT_USERS}`);
      return;
    }

    // Check concurrent socket user limit for new connections
    if (activeSocketUsers.size >= MAX_CONCURRENT_USERS) {
      console.log(`❌ User ${identifier} rejected - server at capacity (${activeSocketUsers.size}/${MAX_CONCURRENT_USERS})`);
      socket.emit('registrationStatus', { 
        success: false, 
        message: `Server is at capacity. Maximum ${MAX_CONCURRENT_USERS} users allowed.`,
        code: 'USER_LIMIT_EXCEEDED'
      });
      socket.disconnect(true);
      return;
    }

    // Register new socket user
    activeSocketUsers.set(identifier, socket.id);
    socket.userId = identifier; // Store for cleanup on disconnect
    
    socket.emit('registrationStatus', { success: true, message: 'Connected successfully' });
    io.emit('onlineUsers', Array.from(activeSocketUsers.keys()));
    io.emit('userCount', { current: activeSocketUsers.size, max: MAX_CONCURRENT_USERS });
    
    console.log(`✅ User ${identifier} connected via socket. Active socket users: ${activeSocketUsers.size}/${MAX_CONCURRENT_USERS}`);
  });


  // ✅ Join the group room
  socket.on('joinGroup', (groupId) => {
    socket.join(groupId.toString());
    console.log(`✅ Socket ${socket.id} joined group ${groupId}`);
  });

  // ✅ Receive group message and broadcast to group
  socket.on('groupMessage', (msg) => {
    const groupId = msg.groupId.toString(); // Ensure it's a string for room
    console.log(`📨 Message received for group ${groupId}:`, msg);
    socket.to(groupId).emit('receiveGroupMessage', msg); // broadcast to others
  });

  socket.on('disconnect', () => {
    console.log(`🔴 Client disconnected: ${socket.id}`);
  });

 socket.on('privateMessage', async ({ from, to, text, attachment_url }) => {
  const timestamp = getISTTimestamp();
  const targetSocketId = activeSocketUsers.get(to);
  const senderSocketId = activeSocketUsers.get(from);

  try {
    // Step 1: Check if conversation exists
    const [results] = await db.query(
      `
      SELECT id FROM conversations
      WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)
      `,
      [from, to, to, from]
    );

    let conversationId;

    if (results.length > 0) {
      conversationId = results[0].id;
      console.log(`✅ Found existing conversation with ID: ${conversationId}`);
    } else {
      // Step 2: Create new conversation
      const [insertResult] = await db.query(
        `INSERT INTO conversations (user1, user2) VALUES (?, ?)`,
        [from, to]
      );
      conversationId = insertResult.insertId;
      console.log(`🆕 Created new conversation with ID: ${conversationId}`);
    }

    // Step 3: Insert message into messages table
    const [insertMessageResult] = await db.query(
      `
      INSERT INTO messages (conversation_id, sender, text, timestamp, attachment_url)
      VALUES (?, ?, ?, ?, ?)
      `,
      [conversationId, from, text || '', timestamp, attachment_url || null]
    );
    console.log(`✅ Message inserted into DB (Message ID: ${insertMessageResult.insertId})`);

    // Step 4: Emit newMessage to notify front-end
    io.emit('newMessage', { from, to });
    console.log(`📢 Emitted 'newMessage' event`);

    const msg = { from, to, text, timestamp, attachment_url };

    // Step 5: Send to recipient if connected
    if (targetSocketId) {
      io.to(targetSocketId).emit('receivePrivateMessage', msg);
      console.log(`📤 Message sent to recipient's socket [${targetSocketId}]`);
    } else {
      console.log(`⚠️ Recipient (${to}) is not currently connected`);
    }

    // Step 6: Send confirmation back to sender
    if (senderSocketId && senderSocketId !== targetSocketId) {
      io.to(senderSocketId).emit('receivePrivateMessage', msg);
      console.log(`📤 Message confirmation sent back to sender's socket [${senderSocketId}]`);
    }
  } catch (err) {
    console.error('❌ Error in privateMessage handler:', err);
  }
 } );



  socket.on('disconnect', () => {
    console.log(`🔴 Client disconnected: ${socket.id}`);
    
    // Clean up socket user data
    if (socket.userId) {
      activeSocketUsers.delete(socket.userId);
      console.log(`🧹 Removed user ${socket.userId} from active socket users. Active socket users: ${activeSocketUsers.size}/${MAX_CONCURRENT_USERS}`);
    }
    
    // Clean up any remaining references
    for (let [key, val] of activeSocketUsers.entries()) {
      if (val === socket.id) {
        activeSocketUsers.delete(key);
        break;
      }
    }
    
    // Broadcast updated lists
    io.emit('onlineUsers', Array.from(activeSocketUsers.keys()));
    io.emit('userCount', { current: activeSocketUsers.size, max: MAX_CONCURRENT_USERS });
  }  );
}
)

// ======================== START SERVER ========================
const PORT = 8000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
