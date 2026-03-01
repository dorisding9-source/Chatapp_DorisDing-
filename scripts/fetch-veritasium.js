#!/usr/bin/env node
/**
 * Fetches 10 videos from https://www.youtube.com/@veritasium
 * and saves the JSON to public/veritasium_channel_data.json
 *
 * Requires REACT_APP_YOUTUBE_API_KEY in .env
 * Run: node scripts/fetch-veritasium.js
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { google } = require('googleapis');

let YoutubeTranscript;
try {
  YoutubeTranscript = require('youtube-transcript').YoutubeTranscript;
} catch {
  YoutubeTranscript = null;
}

const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

async function fetchVeritasium() {
  if (!YOUTUBE_API_KEY) {
    console.error('Error: REACT_APP_YOUTUBE_API_KEY required in .env');
    process.exit(1);
  }

  const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

  console.log('Resolving channel @veritasium…');
  const list = await youtube.channels.list({
    part: 'id',
    forHandle: 'veritasium',
  });
  const channelId = list.data.items?.[0]?.id;
  if (!channelId) {
    console.error('Could not find Veritasium channel');
    process.exit(1);
  }

  console.log('Fetching 10 latest videos…');
  const searchRes = await youtube.search.list({
    part: 'snippet',
    channelId,
    type: 'video',
    maxResults: 10,
    order: 'date',
  });
  const videoIds = (searchRes.data.items || []).map((i) => i.id?.videoId).filter(Boolean);
  if (!videoIds.length) {
    console.error('No videos found');
    process.exit(1);
  }

  const videosRes = await youtube.videos.list({
    part: 'snippet,contentDetails,statistics',
    id: videoIds.join(','),
  });

  const videos = [];
  const items = videosRes.data.items || [];

  for (let i = 0; i < items.length; i++) {
    const v = items[i];
    const vid = v.id;
    console.log(`  [${i + 1}/${items.length}] ${v.snippet?.title?.slice(0, 50)}…`);

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
      durationSec =
        parseInt(durMatch[1] || 0, 10) * 3600 +
        parseInt(durMatch[2] || 0, 10) * 60 +
        parseInt(durMatch[3] || 0, 10);
    }

    videos.push({
      title: v.snippet?.title || '',
      description: v.snippet?.description || '',
      transcript,
      duration: durationSec,
      release_date: v.snippet?.publishedAt || '',
      views: parseInt(v.statistics?.viewCount || 0, 10),
      likes: parseInt(v.statistics?.likeCount || 0, 10),
      comments: parseInt(v.statistics?.commentCount || 0, 10),
      video_url: `https://www.youtube.com/watch?v=${vid}`,
      video_id: vid,
      thumbnail_url:
        v.snippet?.thumbnails?.maxres?.url ||
        v.snippet?.thumbnails?.high?.url ||
        v.snippet?.thumbnails?.default?.url ||
        '',
    });
  }

  const outputPath = path.resolve(__dirname, '..', 'public', 'veritasium_channel_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(videos, null, 2), 'utf8');
  console.log(`\nSaved ${videos.length} videos to ${outputPath}`);
}

fetchVeritasium().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
