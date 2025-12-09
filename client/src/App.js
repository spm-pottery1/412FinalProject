import React, { useEffect, useState, useCallback } from 'react';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '/api';

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

  // Group chat state
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  // AI chatbot state
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('conversations'); 
  const [chatType, setChatType] = useState('direct'); 

  // ==================== STABLE DATA LOADERS ====================

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setSelectedUser(null);
    setMessages([]);
    setUsers([]);
  }, []);

  const loadCurrentUser = useCallback(() => {
    if (!token) return;
    try {
      const decoded = JSON.parse(atob(token.split('.')[1]));
      setCurrentUser(decoded);
    } catch (error) {
      console.error('Error decoding token:', error);
      handleLogout();
    }
  }, [token, handleLogout]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setUsers(data.users);
    } catch (error) { console.error('Error loading users:', error); }
  }, [token]);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setConversations(data.conversations);
    } catch (error) { console.error('Error loading conversations:', error); }
  }, [token]);

  const loadMessages = useCallback(async (userId) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/messages/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setMessages(data.messages);
    } catch (error) { console.error('Error loading messages:', error); }
  }, [token]);

  const loadGroups = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setGroups(data.groups || []);
    } catch (error) { console.error('Error loading groups:', error); }
  }, [token]);

  const loadAiHistory = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/ai/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (response.ok && data.history) {
        // Transform the flat database records into individual chat bubbles
        const transformedHistory = [];
        data.history.forEach(row => {
          // Push the User's part
          transformedHistory.push({ role: 'user', content: row.message });
          // Push the AI's part
          transformedHistory.push({ role: 'assistant', content: row.response });
        });
        
        setAiMessages(transformedHistory);
      }
    } catch (error) { 
      console.error('Error loading AI history:', error); 
    }
  }, [token]);

  const loadGroupMessages = useCallback(async (groupId) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/groups/${groupId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setGroupMessages(data.messages || []);
    } catch (error) { console.error('Error loading group messages:', error); }
  }, [token]);

  const loadGroupMembers = useCallback(async (groupId) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/groups/${groupId}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setGroupMembers(data.members || []);
    } catch (error) { console.error('Error loading group members:', error); }
  }, [token]);

  // ==================== EFFECTS ====================

  useEffect(() => {
    if (token) {
      loadCurrentUser();
      loadUsers();
      loadConversations();
      loadGroups();
      loadAiHistory();
    }
  }, [token, loadCurrentUser, loadUsers, loadConversations, loadGroups, loadAiHistory]);

  useEffect(() => {
    if (selectedUser && token && chatType === 'direct') {
      loadMessages(selectedUser.id);
      const interval = setInterval(() => loadMessages(selectedUser.id), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedUser, token, chatType, loadMessages]);

  useEffect(() => {
    if (selectedGroup && token && chatType === 'group') {
      loadGroupMessages(selectedGroup.id);
      loadGroupMembers(selectedGroup.id);
      const interval = setInterval(() => {
        loadGroupMessages(selectedGroup.id);
        loadGroupMembers(selectedGroup.id);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedGroup, token, chatType, loadGroupMessages, loadGroupMembers]);

  // ==================== HANDLERS ====================

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
      } else { setError(data.error || 'Registration failed'); }
    } catch (err) { setError('Network error'); } 
    finally { setLoading(false); }
  };

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
      } else { setError(data.error || 'Login failed'); }
    } catch (err) { setError('Network error'); } 
    finally { setLoading(false); }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;
    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ recipient_id: selectedUser.id, content: newMessage.trim() })
      });
      if (response.ok) {
        setNewMessage('');
        loadMessages(selectedUser.id);
        loadConversations();
      }
    } catch (err) { console.error(err); }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newGroupName, description: newGroupDescription })
      });
      if (response.ok) {
        setNewGroupName('');
        setNewGroupDescription('');
        setShowCreateGroup(false);
        loadGroups();
      }
    } catch (err) { console.error(err); }
  };

  const handleSendGroupMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup) return;
    try {
      const response = await fetch(`${API_URL}/groups/${selectedGroup.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content: newMessage.trim() })
      });
      if (response.ok) {
        setNewMessage('');
        loadGroupMessages(selectedGroup.id);
      }
    } catch (err) { console.error(err); }
  };

  const handleSendAiMessage = async (e) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = { role: 'user', content: aiInput.trim() };
    // Optimistically add user message so it displays instantly
    setAiMessages(prev => [...prev, userMsg]);
    
    setAiLoading(true);
    const originalInput = aiInput; // Store to clear if successful
    setAiInput(''); 

    try {
      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: originalInput })
      });

      const data = await response.json();

      if (response.ok) {
        // Option 1: Append response manually if loadAiHistory is slow
        const aiResponse = { role: 'assistant', content: data.message };
        setAiMessages(prev => [...prev, aiResponse]);
        // Option 2: Full refresh to sync with DB
        loadAiHistory(); 
      } else {
        setError(data.error || 'AI failed to respond');
      }
    } catch (err) {
      setError('Network error with AI service');
    } finally {
      setAiLoading(false);
    }
  };

  const resetForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setError('');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const handleSelectUser = (user) => { setSelectedUser(user); setSelectedGroup(null); setChatType('direct'); setView('chat'); };
  const handleSelectGroup = (group) => { setSelectedGroup(group); setSelectedUser(null); setChatType('group'); setView('chat'); };
  const handleSelectAI = () => { setSelectedUser(null); setSelectedGroup(null); setChatType('ai'); setView('chat'); };

  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>{isLogin ? 'Login' : 'Register'}</h1>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={isLogin ? handleLogin : handleRegister}>
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            {!isLogin && <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit" disabled={loading}>{loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}</button>
          </form>
          <p className="toggle-auth">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => { setIsLogin(!isLogin); resetForm(); }}>{isLogin ? 'Register' : 'Login'}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1> Section Connection</h1>
        <div className="user-info">
          <span>Welcome, {currentUser?.username}!</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button className={view === 'conversations' ? 'active' : ''} onClick={() => setView('conversations')}>Chats</button>
            <button className={view === 'groups' ? 'active' : ''} onClick={() => setView('groups')}>Groups</button>
            <button className={view === 'users' ? 'active' : ''} onClick={() => setView('users')}>Users</button>
            <button className={view === 'ai' ? 'active' : ''} onClick={() => { setView('ai'); handleSelectAI(); }}>AI Chat</button>
          </div>

          <div className="sidebar-list">
            {view === 'conversations' ? (
              conversations.map((conv) => (
                <div key={conv.other_user_id} className={`user-item ${selectedUser?.id === conv.other_user_id ? 'active' : ''}`} onClick={() => handleSelectUser({ id: conv.other_user_id, username: conv.other_user })}>
                  <div className="user-avatar">{conv.other_user[0].toUpperCase()}</div>
                  <div className="user-details"><strong>{conv.other_user}</strong><p>{conv.content.substring(0, 30)}...</p></div>
                  <span className="time">{formatTime(conv.created_at)}</span>
                </div>
              ))
            ) : view === 'groups' ? (
              <>
                <button className="create-group-btn" onClick={() => setShowCreateGroup(!showCreateGroup)}> Create Group</button>
                {showCreateGroup && (
                  <div className="create-group-form">
                    <form onSubmit={handleCreateGroup}>
                      <input type="text" placeholder="Group name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} required />
                      <textarea placeholder="Description" value={newGroupDescription} onChange={(e) => setNewGroupDescription(e.target.value)} rows={2} />
                      <div className="form-buttons"><button type="submit">Create</button><button type="button" onClick={() => setShowCreateGroup(false)}>Cancel</button></div>
                    </form>
                  </div>
                )}
                {groups.map((group) => (
                  <div key={group.id} className={`user-item ${selectedGroup?.id === group.id ? 'active' : ''}`} onClick={() => handleSelectGroup(group)}>
                    <div className="user-avatar group-avatar"></div>
                    <div className="user-details"><strong>{group.name}</strong><p>{group.member_count} members</p></div>
                  </div>
                ))}
              </>
            ) : view === 'users' ? (
              users.map((user) => (
                <div key={user.id} className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`} onClick={() => handleSelectUser(user)}>
                  <div className="user-avatar">{user.username[0].toUpperCase()}</div>
                  <div className="user-details"><strong>{user.username}</strong><p>{user.email}</p></div>
                </div>
              ))
            ) : null}
          </div>
        </aside>

        <main className="chat-area">
          {chatType === 'direct' && selectedUser ? (
            <>
              <div className="chat-header">
                <div className="user-avatar">{selectedUser.username[0].toUpperCase()}</div>
                <h2>{selectedUser.username}</h2>
              </div>
              <div className="messages-container">
                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.sender_id === currentUser?.id ? 'sent' : 'received'}`}>
                    <div className="message-content"><p>{msg.content}</p><span className="message-time">{formatTime(msg.created_at)}</span></div>
                  </div>
                ))}
              </div>
              <form className="message-input" onSubmit={handleSendMessage}><input type="text" placeholder="Message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} required /><button type="submit">Send</button></form>
            </>
          ) : chatType === 'group' && selectedGroup ? (
            <>
              <div className="chat-header">
                <div className="user-avatar group-avatar"></div>
                <div>
                    <h2>{selectedGroup.name}</h2>
                    {/* New member list added here */}
                    <p className="member-list-display">
                        <small>Members: {groupMembers.map(m => m.username).join(', ')}</small>
                    </p>
                </div>
              </div>
              <div className="messages-container">
                {groupMessages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.sender_id === currentUser?.id ? 'sent' : 'received'}`}>
                    <div className="message-content">
                      {msg.sender_id !== currentUser?.id && <strong className="sender-name">{msg.sender_username}</strong>}
                      <p>{msg.content}</p><span className="message-time">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <form className="message-input" onSubmit={handleSendGroupMessage}><input type="text" placeholder="Group message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} required /><button type="submit">Send</button></form>
            </>
          ) : chatType === 'ai' ? (
            <>
              <div className="chat-header ai-header">
                <div className="user-avatar ai-avatar"></div>
                <div><h2>AI Assistant</h2><p>Ask me anything!</p></div>
              </div>
              <div className="messages-container">
                {aiMessages.map((msg, index) => (
                  <div key={index} className={`message ${msg.role === 'user' ? 'sent' : 'received ai-message'}`}>
                    <div className="message-content"><p>{msg.content}</p></div>
                  </div>
                ))}
                {aiLoading && <p>Thinking...</p>}
              </div>
              <form className="message-input" onSubmit={handleSendAiMessage}><input type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)} required /><button type="submit">Send</button></form>
            </>
          ) : <div className="no-chat-selected"><h2>Select a chat</h2></div>}
        </main>
      </div>
    </div>
  );
}

export default App;