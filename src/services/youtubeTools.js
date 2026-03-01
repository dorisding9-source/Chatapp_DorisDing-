// ── YouTube / JSON tools for chat ────────────────────────────────────────────

const numericValues = (rows, col) =>
  rows.map((r) => parseFloat(r[col])).filter((v) => !isNaN(v));

const median = (sorted) =>
  sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

const fmt = (n) => +n.toFixed(4);

const FIELD_ALIASES = {
  view_count: ['views', 'viewcount'],
  like_count: ['likes', 'likecount'],
  comment_count: ['comments', 'commentcount'],
  views: ['view_count', 'viewcount'],
  likes: ['like_count', 'likecount'],
  comments: ['comment_count', 'commentcount'],
};

const resolveField = (rows, name) => {
  if (!rows?.length || !name) return name;
  const keys = Object.keys(rows[0]);
  if (keys.includes(name)) return name;
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(name);
  let found = keys.find((k) => norm(k) === target);
  if (found) return found;
  for (const key of keys) {
    const aliases = FIELD_ALIASES[norm(key)] || FIELD_ALIASES[key];
    if (aliases?.some((a) => norm(a) === target)) return key;
  }
  return name;
};

export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate an image from a text prompt and an optional anchor/reference image. ' +
      'Use when the user asks to create, generate, or make an image. ' +
      'Requires a text prompt; anchor image is optional (user may drag one in).',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Detailed text description of the image to generate.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot any numeric field (view_count, like_count, comment_count, duration, etc.) vs time for YouTube channel videos. ' +
      'Use when the user asks to plot, graph, or visualize a metric over time.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_field: {
          type: 'STRING',
          description: 'Numeric field to plot (e.g. view_count, like_count, comment_count, duration).',
        },
      },
      required: ['metric_field'],
    },
  },
  {
    name: 'play_video',
    description:
      'Open or play a video from the loaded channel data. ' +
      'User can specify by: title (e.g. "play the asbestos video"), ordinal (e.g. "play the first video", "play the 3rd video"), or "most viewed".',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: {
          type: 'STRING',
          description:
            'How to pick the video: "first", "second", "third", "1", "2", "most viewed", or partial title match (e.g. "asbestos").',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'compute_stats_json',
    description:
      'Compute mean, median, std, min, and max for any numeric field in the channel JSON (e.g. view_count, like_count, comment_count, duration). ' +
      'Use when the user asks for statistics, average, or distribution of a numeric column.',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description: 'Numeric field name (e.g. view_count, like_count, comment_count, duration).',
        },
      },
      required: ['field'],
    },
  },
];

export async function executeYoutubeTool(toolName, args, context) {
  const { jsonData, anchorImageBase64, anchorImageMimeType } = context;
  const videos = jsonData?.videos || [];
  const rows = Array.isArray(videos) ? videos : [];

  switch (toolName) {
    case 'compute_stats_json': {
      const field = resolveField(rows, args.field);
      const vals = numericValues(rows, field);
      if (!vals.length)
        return {
          error: `No numeric values in "${field}". Available: ${rows[0] ? Object.keys(rows[0]).join(', ') : 'none'}`,
        };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: fmt(mean),
        median: fmt(median(sorted)),
        std: fmt(Math.sqrt(variance)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    case 'plot_metric_vs_time': {
      const field = resolveField(rows, args.metric_field);
      const dateField = rows[0]?.release_date ? 'release_date' : null;
      const data = rows
        .map((r) => {
          const val = parseFloat(r[field]);
          const date = r[dateField] || r.release_date || '';
          return { date, value: isNaN(val) ? 0 : val, title: r.title?.slice(0, 40) };
        })
        .filter((d) => d.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!data.length)
        return {
          error: `No data for "${field}" vs time. Check field name.`,
        };
      return {
        _chartType: 'metric_vs_time',
        metricField: field,
        data,
      };
    }

    case 'play_video': {
      const sel = (args.selector || '').toLowerCase().trim();
      const getViews = (r) => r.view_count ?? r.views ?? 0;
      const getUrl = (r) => r.video_url || (r.video_id ? `https://www.youtube.com/watch?v=${r.video_id}` : '');
      let video = null;
      if (sel === 'most viewed' || sel === 'most viewed video') {
        const sorted = [...rows].sort((a, b) => getViews(b) - getViews(a));
        video = sorted[0];
      } else if (/^(first|1st|1)$/.test(sel)) {
        video = rows[0];
      } else if (/^(second|2nd|2)$/.test(sel)) {
        video = rows[1];
      } else if (/^(third|3rd|3)$/.test(sel)) {
        video = rows[2];
      } else if (/^(\d+)$/.test(sel)) {
        const idx = parseInt(sel, 10) - 1;
        video = rows[idx];
      } else {
        video = rows.find((v) => (v.title || '').toLowerCase().includes(sel));
      }
      if (!video)
        return {
          error: `Video not found for "${args.selector}". Try "first", "most viewed", or a title keyword.`,
        };
      return {
        _chartType: 'play_video',
        video_id: video.video_id,
        title: video.title,
        thumbnail_url: video.thumbnail_url,
        video_url: getUrl(video),
      };
    }

    case 'generateImage': {
      const API = process.env.REACT_APP_API_URL || '';
      try {
        const body = { prompt: args.prompt || 'A beautiful image' };
        if (anchorImageBase64) {
          body.anchorImageBase64 = anchorImageBase64;
          if (anchorImageMimeType) body.anchorImageMimeType = anchorImageMimeType;
        }
        const res = await fetch(`${API}/api/generate-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Image generation failed');
        return {
          _chartType: 'generated_image',
          imageBase64: data.imageBase64,
          prompt: data.prompt,
        };
      } catch (err) {
        const msg = err.message || 'Unknown error';
        return { error: `Image generation failed: ${msg}. (Check server logs for details. Ensure REACT_APP_GEMINI_API_KEY in .env is from aistudio.google.com/apikey.)` };
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
