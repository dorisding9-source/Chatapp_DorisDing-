import { useState } from 'react';
import './YouTubeChannelDownload.css';

const API = process.env.REACT_APP_API_URL || '';

export default function YouTubeChannelDownload({ username, onLogout }) {
  const [channelUrl, setChannelUrl] = useState('');
  const [maxVideos, setMaxVideos] = useState(10);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [progressMessage, setProgressMessage] = useState('');

  const handleDownload = async () => {
    setError('');
    setResult(null);
    setLoading(true);
    setProgress(0);
    setProgressMessage('');
    try {
      const res = await fetch(`${API}/api/youtube/channel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          channelUrl: channelUrl.trim(),
          maxVideos: Math.min(Math.max(maxVideos, 1), 100),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || data.message || `Download failed (${res.status})`;
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'progress') {
                setProgress((data.current / data.total) * 100);
                setProgressMessage(data.message || '');
              } else if (data.type === 'complete') {
                finalData = { videos: data.videos, channelId: data.channelId };
                setProgress(100);
                setProgressMessage('');
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }
      if (finalData) setResult(finalData);
      else throw new Error('No data received');
    } catch (err) {
      setError(err.message || 'Download failed');
      setProgress(0);
      setProgressMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = () => {
    if (!result?.videos) return;
    const downloadArray = result.videos.map((v) => ({
      title: v.title,
      description: v.description,
      transcript: v.transcript,
      duration: v.duration,
      release_date: v.release_date,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      video_url: v.video_url,
    }));
    const blob = new Blob([JSON.stringify(downloadArray, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube_channel_${result.channelId || 'data'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="youtube-download-page">
      <header className="youtube-header">
        <h1>YouTube Channel Download</h1>
        <div className="youtube-user-row">
          <span>{username}</span>
          <button onClick={onLogout} className="youtube-logout">Log out</button>
        </div>
      </header>

      <div className="youtube-content">
        <div className="youtube-form">
          <input
            type="url"
            placeholder="YouTube channel URL (e.g. https://www.youtube.com/@veritasium)"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            disabled={loading}
          />
          <div className="youtube-form-row">
            <label>
              Max videos: <input
                type="number"
                min={1}
                max={100}
                value={maxVideos}
                onChange={(e) => setMaxVideos(parseInt(e.target.value, 10) || 10)}
                disabled={loading}
              />
            </label>
            <button
              onClick={handleDownload}
              disabled={loading || !channelUrl.trim()}
              className="youtube-download-btn"
            >
              {loading ? 'Downloading…' : 'Download Channel Data'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="youtube-progress-wrap">
            {progressMessage && (
              <p className="youtube-progress-message">{progressMessage}</p>
            )}
            <div className="youtube-progress-row">
              <div className="youtube-progress-bar">
                <div className="youtube-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {error && <p className="youtube-error">{error}</p>}

        {result?.videos?.length > 0 && (
          <div className="youtube-result">
            <h3>Downloaded {result.videos.length} videos</h3>
            <button onClick={handleDownloadFile} className="youtube-save-btn">
              Download JSON File
            </button>
            <div className="youtube-video-list">
              {result.videos.slice(0, 5).map((v) => (
                <div key={v.video_id} className="youtube-video-item">
                  <strong>{v.title}</strong> — {(v.views ?? v.view_count)?.toLocaleString()} views
                </div>
              ))}
              {result.videos.length > 5 && (
                <p className="youtube-more">+ {result.videos.length - 5} more</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
