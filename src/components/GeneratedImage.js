import { useState, useEffect } from 'react';

export default function GeneratedImage({ imageBase64, prompt }) {
  const [enlarged, setEnlarged] = useState(false);

  const handleDownload = (e) => {
    e?.stopPropagation();
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${imageBase64}`;
    a.download = 'generated-image.png';
    a.click();
  };

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setEnlarged(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enlarged]);

  return (
    <div className={`generated-image-wrap ${enlarged ? 'enlarged' : ''}`}>
      <div
        className="generated-image-click-area"
        onClick={() => setEnlarged(!enlarged)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setEnlarged(!enlarged)}
      >
        <img
          src={`data:image/png;base64,${imageBase64}`}
          alt={prompt || 'Generated image'}
          className="generated-image-img"
        />
      </div>
      <div className="generated-image-actions">
        <button
          type="button"
          className="generated-image-download"
          onClick={handleDownload}
          title="Download image"
        >
          Download
        </button>
        <button
          type="button"
          className="generated-image-enlarge"
          onClick={() => setEnlarged(true)}
          title="Enlarge"
        >
          Enlarge
        </button>
      </div>
      {enlarged && (
        <div
          className="generated-image-overlay"
          onClick={() => setEnlarged(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setEnlarged(false)}
        >
          <button
            type="button"
            className="generated-image-close"
            onClick={() => setEnlarged(false)}
            aria-label="Close"
          >
            ×
          </button>
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt={prompt || 'Generated image'}
            className="generated-image-img-enlarged"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="generated-image-download"
            onClick={handleDownload}
          >
            Download
          </button>
        </div>
      )}
    </div>
  );
}
