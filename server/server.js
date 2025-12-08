const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const OpenAI = require('openai');
require('dotenv').config();

const db = require('./config/db');
const authenticateToken = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors()); // Enable CORS for frontend
app.use(express.json()); // Parse JSON request bodies

// ==================== AUTH ROUTES ====================

/**
 * POST /api/auth/register
 * Register a new user
 * Validates input, hashes password, stores in database
 */
app.post('/api/auth/register', [
  body('username').isLength({ min: 3 }).trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, email, password } = req.body;

  try {
    // Check if user already exists
    const userExists = await db.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password with bcrypt (10 salt rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert new user into database
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );

    const newUser = result.rows[0];

    // Generate JWT token (expires in 24 hours)
    const token = jwt.sign(
      { id: newUser.id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: newUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

/**
 * POST /api/auth/login
 * Login existing user
 * Validates credentials and returns JWT token
 */
app.post('/api/auth/login', [
  body('username').notEmpty(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    // Find user by username
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Compare provided password with hashed password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ==================== USER ROUTES ====================

/**
 * GET /api/users
 * Get all users (protected route)
 * Returns list of all users except current user
 */
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, created_at FROM users WHERE id != $1 ORDER BY username',
      [req.user.id]
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error fetching users' });
  }
});

/**
 * GET /api/users/:id
 * Get specific user by ID (protected route)
 */
app.get('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Server error fetching user' });
  }
});

// ==================== MESSAGE ROUTES ====================

/**
 * POST /api/messages
 * Send a new message (protected route)
 * Creates message from authenticated user to recipient
 */
app.post('/api/messages', [
  authenticateToken,
  body('recipient_id').isInt(),
  body('content').notEmpty().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { recipient_id, content } = req.body;
  const sender_id = req.user.id;

  // Prevent sending message to self
  if (sender_id === parseInt(recipient_id)) {
    return res.status(400).json({ error: 'Cannot send message to yourself' });
  }

  try {
    // Verify recipient exists
    const recipientCheck = await db.query(
      'SELECT id FROM users WHERE id = $1',
      [recipient_id]
    );

    if (recipientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Insert message into database
    const result = await db.query(
      'INSERT INTO messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING *',
      [sender_id, recipient_id, content]
    );

    res.status(201).json({
      message: 'Message sent successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Server error sending message' });
  }
});

/**
 * GET /api/messages/:userId
 * Get conversation with specific user (protected route)
 * Returns all messages between current user and specified user
 */
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  const currentUserId = req.user.id;
  const otherUserId = req.params.userId;

  try {
    // Get all messages between two users, ordered by timestamp
    const result = await db.query(
      `SELECT m.*, 
              u1.username as sender_username, 
              u2.username as recipient_username
       FROM messages m
       JOIN users u1 ON m.sender_id = u1.id
       JOIN users u2 ON m.recipient_id = u2.id
       WHERE (m.sender_id = $1 AND m.recipient_id = $2)
          OR (m.sender_id = $2 AND m.recipient_id = $1)
       ORDER BY m.created_at ASC`,
      [currentUserId, otherUserId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

/**
 * GET /api/messages
 * Get all conversations for current user (protected route)
 * Returns recent messages grouped by conversation
 */
app.get('/api/messages', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // Get most recent message from each conversation
    const result = await db.query(
      `SELECT DISTINCT ON (
        CASE 
          WHEN m.sender_id = $1 THEN m.recipient_id 
          ELSE m.sender_id 
        END
      )
      m.*,
      u1.username as sender_username,
      u2.username as recipient_username,
      CASE 
        WHEN m.sender_id = $1 THEN u2.username 
        ELSE u1.username 
      END as other_user,
      CASE 
        WHEN m.sender_id = $1 THEN m.recipient_id 
        ELSE m.sender_id 
      END as other_user_id
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      JOIN users u2 ON m.recipient_id = u2.id
      WHERE m.sender_id = $1 OR m.recipient_id = $1
      ORDER BY 
        CASE 
          WHEN m.sender_id = $1 THEN m.recipient_id 
          ELSE m.sender_id 
        END,
        m.created_at DESC`,
      [userId]
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Server error fetching conversations' });
  }
});

/**
 * PATCH /api/messages/:id/read
 * Mark message as read (protected route)
 */
app.patch('/api/messages/:id/read', authenticateToken, async (req, res) => {
  const messageId = req.params.id;
  const userId = req.user.id;

  try {
    // Only recipient can mark message as read
    const result = await db.query(
      'UPDATE messages SET is_read = true WHERE id = $1 AND recipient_id = $2 RETURNING *',
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    res.json({ 
      message: 'Message marked as read',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Server error updating message' });
  }
});

/**
 * DELETE /api/messages/:id
 * Delete a message (protected route)
 * Only sender can delete their own messages
 */
app.delete('/api/messages/:id', authenticateToken, async (req, res) => {
  const messageId = req.params.id;
  const userId = req.user.id;

  try {
    const result = await db.query(
      'DELETE FROM messages WHERE id = $1 AND sender_id = $2 RETURNING *',
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Server error deleting message' });
  }
});

// ==================== GROUP CHAT ROUTES ====================

/**
 * GET /api/groups
 * Get all groups user is a member of (protected route)
 */
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, u.username as creator_username,
              COUNT(DISTINCT gm.user_id) as member_count
       FROM groups g
       JOIN users u ON g.created_by = u.id
       JOIN group_members gm ON g.id = gm.group_id
       WHERE g.id IN (
         SELECT group_id FROM group_members WHERE user_id = $1
       )
       GROUP BY g.id, u.username
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );

    res.json({ groups: result.rows });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Server error fetching groups' });
  }
});

/**
 * POST /api/groups
 * Create a new group (protected route)
 */
app.post('/api/groups', [
  authenticateToken,
  body('name').notEmpty().trim(),
  body('description').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description } = req.body;

  try {
    // Create group
    const groupResult = await db.query(
      'INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.id]
    );

    const group = groupResult.rows[0];

    // Add creator as member
    await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.user.id]
    );

    res.status(201).json({
      message: 'Group created successfully',
      group
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Server error creating group' });
  }
});

/**
 * POST /api/groups/:groupId/members
 * Add member to group (protected route)
 */
app.post('/api/groups/:groupId/members', [
  authenticateToken,
  body('user_id').isInt()
], async (req, res) => {
  const { groupId } = req.params;
  const { user_id } = req.body;

  try {
    // Check if requester is a member
    const memberCheck = await db.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Add new member
    await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, user_id]
    );

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Server error adding member' });
  }
});

/**
 * GET /api/groups/:groupId/messages
 * Get all messages in a group (protected route)
 */
app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
  const { groupId } = req.params;

  try {
    // Check if user is a member
    const memberCheck = await db.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Get messages
    const result = await db.query(
      `SELECT gm.*, u.username as sender_username
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.created_at ASC`,
      [groupId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

/**
 * POST /api/groups/:groupId/messages
 * Send message to group (protected route)
 */
app.post('/api/groups/:groupId/messages', [
  authenticateToken,
  body('content').notEmpty().trim()
], async (req, res) => {
  const { groupId } = req.params;
  const { content } = req.body;

  try {
    // Check if user is a member
    const memberCheck = await db.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Insert message
    const result = await db.query(
      'INSERT INTO group_messages (group_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
      [groupId, req.user.id, content]
    );

    res.status(201).json({
      message: 'Message sent successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error sending group message:', error);
    res.status(500).json({ error: 'Server error sending message' });
  }
});

/**
 * GET /api/groups/:groupId/members
 * Get all members of a group (protected route)
 */
app.get('/api/groups/:groupId/members', authenticateToken, async (req, res) => {
  const { groupId } = req.params;

  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.email, gm.joined_at
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );

    res.json({ members: result.rows });
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({ error: 'Server error fetching members' });
  }
});

// ==================== AI CHATBOT ROUTES ====================

/**
 * POST /api/ai/chat
 * Send message to AI chatbot (protected route)
 */
app.post('/api/ai/chat', [
  authenticateToken,
  body('message').notEmpty().trim()
], async (req, res) => {
  const { message } = req.body;

  try {
    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant in a messaging app. Be concise and friendly."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0].message.content;

    // Save to database
    await db.query(
      'INSERT INTO ai_chat_history (user_id, message, response) VALUES ($1, $2, $3)',
      [req.user.id, message, aiResponse]
    );

    res.json({
      message: aiResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error with AI chat:', error);
    
    // Check if it's an OpenAI API error
    if (error.status === 401) {
      return res.status(500).json({ 
        error: 'AI service not configured. Please add your OpenAI API key to .env file' 
      });
    }
    
    res.status(500).json({ error: 'Server error processing AI request' });
  }
});

/**
 * GET /api/ai/history
 * Get AI chat history for current user (protected route)
 */
app.get('/api/ai/history', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM ai_chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching AI history:', error);
    res.status(500).json({ error: 'Server error fetching history' });
  }
});

/**
 * DELETE /api/ai/history
 * Clear AI chat history (protected route)
 */
app.delete('/api/ai/history', authenticateToken, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM ai_chat_history WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ message: 'Chat history cleared successfully' });
  } catch (error) {
    console.error('Error clearing AI history:', error);
    res.status(500).json({ error: 'Server error clearing history' });
  }
});

// ==================== HEALTH CHECK ====================

/**
 * GET /api/health
 * Health check endpoint to verify server is running
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
  console.log(` API available at http://localhost:${PORT}/api`);
});

/** 
 * POST /api/groups/:groupId/members
 * Add member to group (protected route)
 */
app.post('/api/groups/:groupId/members', [
  authenticateToken,
  body('user_id').isInt()
], async (req, res) => {
  const { groupId } = req.params;
  const { user_id } = req.body;

  try {
    // 1. Check if the requester is already a member of this group
    const memberCheck = await db.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You must be a member to add others' });
    }

    // 2. Add the new member (ON CONFLICT prevents duplicate memberships)
    await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, user_id]
    );

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Server error adding member' });
  }
});