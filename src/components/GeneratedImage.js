import { useState } from 'react';

export default function GeneratedImage({ imageBase64, prompt }) {
  const [enlarged, setEnlarged] = useState(false);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${imageBase64}`;
    a.download = 'generated-image.png';
    a.click();
  };

  return (
    <div
      className={`generated-image-wrap ${enlarged ? 'enlarged' : ''}`}
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
      {enlarged && (
        <button className="generated-image-download" onClick={(e) => { e.stopPropagation(); handleDownload(); }}>
          Download
        </button>
      )}
    </div>
  );
}
