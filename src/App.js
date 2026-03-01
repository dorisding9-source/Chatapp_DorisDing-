import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeChannelDownload from './components/YouTubeChannelDownload';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('chatapp_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return localStorage.getItem('chatapp_user') ? { username: localStorage.getItem('chatapp_user') } : null;
    }
  });
  const [activeTab, setActiveTab] = useState('chat');

  const handleLogin = (userData) => {
    const u = typeof userData === 'string' ? { username: userData } : userData;
    localStorage.setItem('chatapp_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    setUser(null);
  };

  if (user) {
    const username = typeof user === 'string' ? user : user.username;
    return (
      <div className="app-with-tabs">
        <nav className="app-tabs">
          <button
            className={activeTab === 'chat' ? 'active' : ''}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={activeTab === 'youtube' ? 'active' : ''}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube Channel Download
          </button>
        </nav>
        {activeTab === 'chat' ? (
          <Chat username={username} user={user} onLogout={handleLogout} />
        ) : (
          <YouTubeChannelDownload username={username} onLogout={handleLogout} />
        )}
      </div>
    );
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
