import { useState } from 'react';

export default function PlayVideoCard({ video_id, title, thumbnail_url, video_url }) {
  const [enlarged, setEnlarged] = useState(false);
  const url = video_url || `https://www.youtube.com/watch?v=${video_id}`;

  return (
    <div
      className={`play-video-card ${enlarged ? 'enlarged' : ''}`}
      onClick={() => setEnlarged(!enlarged)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setEnlarged(!enlarged)}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="play-video-link"
      >
        <div className="play-video-thumb">
          {thumbnail_url && <img src={thumbnail_url} alt="" />}
          <span className="play-video-icon">▶</span>
        </div>
        <span className="play-video-title">{title || 'Video'}</span>
      </a>
    </div>
  );
}
