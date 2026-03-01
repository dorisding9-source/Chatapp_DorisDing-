const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { google } = require('googleapis');
let YoutubeTranscript;
try {
  YoutubeTranscript = require('youtube-transcript').YoutubeTranscript;
} catch {
  YoutubeTranscript = null;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

if (!URI || !URI.startsWith('mongodb')) {
  console.error('MongoDB URI missing or invalid. Add REACT_APP_MONGODB_URI to .env (e.g. mongodb+srv://user:pass@cluster.mongodb.net/)');
}

let db;

const DB_ERROR = 'Database not connected. Add a valid REACT_APP_MONGODB_URI to .env and restart the server.';

function requireDb(req, res, next) {
  if (!db) return res.status(503).json({ error: DB_ERROR });
  next();
}

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', requireDb, async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', requireDb, async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: firstName ? String(firstName).trim() : null,
      lastName: lastName ? String(lastName).trim() : null,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', requireDb, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({
      ok: true,
      username: name,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', requireDb, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', requireDb, async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', requireDb, async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', requireDb, async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube Channel Download ─────────────────────────────────────────────────

const YOUTUBE_API_KEY = (process.env.REACT_APP_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || '').trim();
if (!YOUTUBE_API_KEY) {
  console.warn('YouTube API key not set. Add REACT_APP_YOUTUBE_API_KEY to .env for YouTube Channel Download.');
}

app.post('/api/youtube/channel', async (req, res) => {
  if (!YOUTUBE_API_KEY) {
    return res.status(400).json({ error: 'YouTube API key required. Add REACT_APP_YOUTUBE_API_KEY to .env' });
  }
  const useStream = req.headers.accept?.includes('text/event-stream');
  const sendProgress = useStream
    ? (current, total, message) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', current, total, message })}\n\n`);
      }
    : () => {};

  try {
    const { channelUrl, maxVideos = 10 } = req.body;
    const max = Math.min(Math.max(parseInt(maxVideos, 10) || 10, 1), 100);
    if (!channelUrl || typeof channelUrl !== 'string') {
      return res.status(400).json({ error: 'channelUrl required' });
    }

    if (useStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });
    let channelId = channelUrl.match(/\/channel\/([a-zA-Z0-9_-]+)/)?.[1];
    const handleMatch = channelUrl.match(/youtube\.com\/@([\w.-]+)/);
    if (!channelId && handleMatch) {
      sendProgress(0, max, 'Resolving channel…');
      const list = await youtube.channels.list({
        part: 'id',
        forHandle: handleMatch[1],
      });
      channelId = list.data.items?.[0]?.id;
    }
    if (!channelId) {
      return useStream ? res.end() : res.status(400).json({ error: 'Could not resolve channel ID from URL' });
    }

    sendProgress(0, max, 'Fetching video list…');
    const searchRes = await youtube.search.list({
      part: 'snippet',
      channelId,
      type: 'video',
      maxResults: max,
      order: 'date',
    });
    const videoIds = (searchRes.data.items || []).map((i) => i.id?.videoId).filter(Boolean);
    if (!videoIds.length) {
      const empty = { videos: [], channelId };
      return useStream
        ? (res.write(`data: ${JSON.stringify({ type: 'complete', ...empty })}\n\n`), res.end())
        : res.json(empty);
    }

    const videosRes = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoIds.join(','),
    });
    const videos = [];
    const items = videosRes.data.items || [];
    const total = items.length;

    for (let i = 0; i < items.length; i++) {
      sendProgress(i + 1, total, `Downloading video ${i + 1} of ${total}…`);
      const v = items[i];
      const vid = v.id;
      let transcript = '';
      if (YoutubeTranscript) {
        try {
          const t = await YoutubeTranscript.fetchTranscript(vid);
          transcript = t ? t.map((x) => x.text).join(' ') : '';
        } catch {
          transcript = '';
        }
      }
      const duration = v.contentDetails?.duration || '';
      const durMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      let durationSec = 0;
      if (durMatch) {
        durationSec = (parseInt(durMatch[1] || 0, 10) * 3600) +
          (parseInt(durMatch[2] || 0, 10) * 60) +
          parseInt(durMatch[3] || 0, 10);
      }
      const video = {
        video_id: vid,
        title: v.snippet?.title || '',
        description: v.snippet?.description || '',
        transcript,
        duration: durationSec,
        duration_iso: duration,
        release_date: v.snippet?.publishedAt || '',
        views: parseInt(v.statistics?.viewCount || 0, 10),
        likes: parseInt(v.statistics?.likeCount || 0, 10),
        comments: parseInt(v.statistics?.commentCount || 0, 10),
        video_url: `https://www.youtube.com/watch?v=${vid}`,
        thumbnail_url: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || '',
      };
      videos.push(video);
    }

    const result = { videos, channelId };
    if (useStream) {
      res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
      res.end();
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error('YouTube API error:', err.message);
    if (useStream) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message || 'YouTube API failed' });
    }
  }
});

// ── Image generation ─────────────────────────────────────────────────────────

const GEMINI_KEY = process.env.REACT_APP_GEMINI_API_KEY;
console.log('Gemini key present:', !!GEMINI_KEY);

app.post('/api/generate-image', async (req, res) => {
  console.log('[Image] POST /api/generate-image received');
  if (!GEMINI_KEY) {
    return res.status(400).json({ error: 'Gemini API key required for image generation' });
  }
  try {
    const { prompt, anchorImageBase64, anchorImageMimeType } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt required' });
    }

    const base64Data = anchorImageBase64
      ? String(anchorImageBase64).replace(/^data:image\/\w+;base64,/, '')
      : null;
    const mimeType = anchorImageMimeType || 'image/png';

    const parts = [{ text: prompt }];
    if (base64Data) {
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }

    const payload = {
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    };

    // Try production model first, then preview (Nano Banana)
    const modelIds = ['gemini-2.5-flash-image', 'gemini-2.5-flash-preview-image'];
    let lastError = null;

    for (const modelId of modelIds) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_KEY}`;
        const apiRes = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await apiRes.json();
        if (!apiRes.ok) {
          lastError = data?.error?.message || data?.error?.details?.[0]?.message || JSON.stringify(data?.error || data);
          console.warn(`Image gen (${modelId}) failed:`, lastError);
          continue;
        }

        const candidate = data?.candidates?.[0];
        if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'RECITATION') {
          return res.status(400).json({ error: 'Content was blocked by safety filters. Try a different prompt.' });
        }

        const responseParts = candidate?.content?.parts || [];
        for (const part of responseParts) {
          if (part.inlineData?.data) {
            return res.json({ imageBase64: part.inlineData.data, prompt });
          }
        }
        lastError = 'No image in response';
      } catch (e) {
        lastError = e.message;
        console.warn(`Image gen (${modelId}) error:`, e.message);
      }
    }

    return res.status(500).json({ error: lastError || 'Image generation failed. Check your Gemini API key at aistudio.google.com/apikey and ensure image models are enabled.' });
  } catch (err) {
    console.error('Image generation error:', err.message);
    return res.status(500).json({ error: err.message || 'Image generation failed' });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', requireDb, async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', requireDb, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    console.warn('Server starting without DB — auth and sessions will not work until you add REACT_APP_MONGODB_URI to .env');
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  });
