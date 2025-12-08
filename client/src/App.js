import React, { useEffect, useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000/api';

function App() {
  // Authentication state
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);

  // Form state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Messaging state
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversations, setConversations] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('conversations'); // 'conversations' or 'users'

  /**
   * Effect: Load current user data when token exists
   */
  useEffect(() => {
    if (token) {
      loadCurrentUser();
      loadUsers();
      loadConversations();
    }
  }, [token]);

  /**
   * Effect: Load messages when user is selected
   */
  useEffect(() => {
    if (selectedUser && token) {
      loadMessages(selectedUser.id);
      // Poll for new messages every 3 seconds
      const interval = setInterval(() => {
        loadMessages(selectedUser.id);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedUser, token]);

  /**
   * Load current user profile from token
   */
  const loadCurrentUser = async () => {
    try {
      const decoded = JSON.parse(atob(token.split('.')[1]));
      setCurrentUser(decoded);
    } catch (error) {
      console.error('Error decoding token:', error);
      handleLogout();
    }
  };

  /**
   * Load all users from API
   */
  const loadUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  /**
   * Load all conversations for current user
   */
  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_URL}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  /**
   * Load messages for specific conversation
   * @param {number} userId - ID of user to load conversation with
   */
  const loadMessages = async (userId) => {
    try {
      const response = await fetch(`${API_URL}/messages/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  /**
   * Handle user registration
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        resetForm();
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle user login
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        resetForm();
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle user logout
   */
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setSelectedUser(null);
    setMessages([]);
    setUsers([]);
    resetForm();
  };

  /**
   * Send a new message
   */
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipient_id: selectedUser.id,
          content: newMessage.trim()
        })
      });

      if (response.ok) {
        setNewMessage('');
        loadMessages(selectedUser.id);
        loadConversations();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to send message');
      }
    } catch (error) {
      setError('Network error. Please try again.');
      console.error('Send message error:', error);
    }
  };

  /**
   * Select a user to chat with
   * @param {Object} user - User object to chat with
   */
  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setView('chat');
  };

  /**
   * Reset form fields
   */
  const resetForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setError('');
  };

  /**
   * Format timestamp for display
   * @param {string} timestamp - ISO timestamp string
   */
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // ==================== RENDER AUTH FORM ====================
  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>{isLogin ? 'Login' : 'Register'}</h1>
          
          {error && <div className="error-message">{error}</div>}
          
          <form onSubmit={isLogin ? handleLogin : handleRegister}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
            
            {!isLogin && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            )}
            
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
            
            <button type="submit" disabled={loading}>
              {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
            </button>
          </form>
          
          <p className="toggle-auth">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => {
              setIsLogin(!isLogin);
              resetForm();
            }}>
              {isLogin ? 'Register' : 'Login'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // ==================== RENDER MESSAGING APP ====================
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>💬 Messaging App</h1>
        <div className="user-info">
          <span>Welcome, {currentUser?.username}!</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="main-content">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button 
              className={view === 'conversations' ? 'active' : ''}
              onClick={() => setView('conversations')}
            >
              Conversations
            </button>
            <button 
              className={view === 'users' ? 'active' : ''}
              onClick={() => setView('users')}
            >
              All Users
            </button>
          </div>

          <div className="sidebar-list">
            {view === 'conversations' ? (
              conversations.length > 0 ? (
                conversations.map((conv) => (
                  <div
                    key={conv.other_user_id}
                    className={`user-item ${selectedUser?.id === conv.other_user_id ? 'active' : ''}`}
                    onClick={() => handleSelectUser({ 
                      id: conv.other_user_id, 
                      username: conv.other_user 
                    })}
                  >
                    <div className="user-avatar">{conv.other_user[0].toUpperCase()}</div>
                    <div className="user-details">
                      <strong>{conv.other_user}</strong>
                      <p>{conv.content.substring(0, 30)}...</p>
                    </div>
                    <span className="time">{formatTime(conv.created_at)}</span>
                  </div>
                ))
              ) : (
                <p className="no-data">No conversations yet. Start chatting!</p>
              )
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => handleSelectUser(user)}
                >
                  <div className="user-avatar">{user.username[0].toUpperCase()}</div>
                  <div className="user-details">
                    <strong>{user.username}</strong>
                    <p>{user.email}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat Area */}
        <main className="chat-area">
          {selectedUser ? (
            <>
              <div className="chat-header">
                <div className="user-avatar">{selectedUser.username[0].toUpperCase()}</div>
                <h2>{selectedUser.username}</h2>
              </div>

              <div className="messages-container">
                {messages.length > 0 ? (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`message ${msg.sender_id === currentUser?.id ? 'sent' : 'received'}`}
                    >
                      <div className="message-content">
                        <p>{msg.content}</p>
                        <span className="message-time">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="no-messages">No messages yet. Say hello! 👋</p>
                )}
              </div>

              <form className="message-input" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  required
                />
                <button type="submit">Send</button>
              </form>
            </>
          ) : (
            <div className="no-chat-selected">
              <h2>Select a user to start chatting</h2>
              <p>Choose from your conversations or browse all users</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;