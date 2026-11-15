import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";

const cropOutputSize = {
  avatar: { width: 512, height: 512 },
  cover: { width: 1600, height: 560 },
};

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

export default function ProfileImageCropDialog({ file, imageType, saving, onCancel, onSave }) {
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const pointerStart = useRef(null);
  const [imageSize, setImageSize] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0.5, y: 0.5 });
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const outputSize = cropOutputSize[imageType];
  const aspectRatio = outputSize.width / outputSize.height;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [imageType]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, saving]);

  const baseScale = imageSize && viewportSize.width && viewportSize.height
    ? Math.max(
        viewportSize.width / imageSize.width,
        viewportSize.height / imageSize.height,
      )
    : 1;
  const scale = baseScale * zoom;
  const imageWidth = (imageSize?.width ?? 0) * scale;
  const imageHeight = (imageSize?.height ?? 0) * scale;
  const overflowX = Math.max(0, imageWidth - viewportSize.width);
  const overflowY = Math.max(0, imageHeight - viewportSize.height);
  const imageLeft = overflowX ? -pan.x * overflowX : (viewportSize.width - imageWidth) / 2;
  const imageTop = overflowY ? -pan.y * overflowY : (viewportSize.height - imageHeight) / 2;

  function startDragging(event) {
    if (!imageSize) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = { x: event.clientX, y: event.clientY, pan };
  }

  function dragImage(event) {
    if (!pointerStart.current) return;
    const start = pointerStart.current;
    setPan({
      x: overflowX
        ? clamp(start.pan.x - (event.clientX - start.x) / overflowX)
        : 0.5,
      y: overflowY
        ? clamp(start.pan.y - (event.clientY - start.y) / overflowY)
        : 0.5,
    });
  }

  function stopDragging() {
    pointerStart.current = null;
  }

  async function saveCrop() {
    const image = imageRef.current;
    if (!image || !imageSize || !viewportSize.width || !viewportSize.height) {
      setError("The image preview is not ready yet.");
      return;
    }
    try {
      const sourceWidth = viewportSize.width / scale;
      const sourceHeight = viewportSize.height / scale;
      const sourceX = (image.naturalWidth - sourceWidth) * pan.x;
      const sourceY = (image.naturalHeight - sourceHeight) * pan.y;
      const canvas = document.createElement("canvas");
      canvas.width = outputSize.width;
      canvas.height = outputSize.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image editing is unavailable in this browser.");
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputSize.width,
        outputSize.height,
      );
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => result
            ? resolve(result)
            : reject(new Error("Could not prepare this image. Please try another.")),
          "image/jpeg",
          0.92,
        );
      });
      await onSave(new File([blob], `${imageType}-image.jpg`, { type: "image/jpeg" }));
    } catch (cropError) {
      setError(cropError.message || "Could not prepare this image. Please try another.");
    }
  }

  return (
    <div
      className="ed-image-crop-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <section
        aria-labelledby="ed-image-crop-title"
        aria-modal="true"
        className="ed-image-crop-dialog"
        role="dialog"
      >
        <div className="ed-image-crop-heading">
          <div>
            <p className="ed-profile-label">MAKE IT YOURS</p>
            <h2 id="ed-image-crop-title">
              Adjust {imageType === "avatar" ? "profile picture" : "cover poster"}
            </h2>
            <p>Drag to position the image, then adjust the zoom.</p>
          </div>
          <button aria-label="Close image editor" disabled={saving} onClick={onCancel} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <div
          aria-label="Drag to crop image"
          className={`ed-image-crop-viewport ${imageType === "avatar" ? "is-avatar" : "is-cover"}`}
          onLostPointerCapture={stopDragging}
          onPointerCancel={stopDragging}
          onPointerDown={startDragging}
          onPointerMove={dragImage}
          onPointerUp={stopDragging}
          ref={viewportRef}
          style={{ aspectRatio }}
        >
          {sourceUrl && (
            <img
              alt=""
              draggable="false"
              onLoad={(event) => setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })}
              ref={imageRef}
              src={sourceUrl}
              style={{
                width: `${imageWidth}px`,
                height: `${imageHeight}px`,
                left: `${imageLeft}px`,
                top: `${imageTop}px`,
              }}
            />
          )}
          {!imageSize && <span className="ed-image-crop-loading">Loading image preview…</span>}
        </div>

        <label className="ed-image-crop-zoom">
          <Minus aria-hidden="true" size={17} />
          <input
            aria-label="Image zoom"
            max="3"
            min="1"
            onChange={(event) => setZoom(Number(event.target.value))}
            step="0.01"
            type="range"
            value={zoom}
          />
          <Plus aria-hidden="true" size={17} />
          <span>{Math.round(zoom * 100)}%</span>
        </label>

        {error && <p className="ed-image-crop-error" role="alert">{error}</p>}
        <div className="ed-image-crop-actions">
          <button className="ed-image-crop-cancel" disabled={saving} onClick={onCancel} type="button">Cancel</button>
          <button className="ed-image-crop-save" disabled={saving || !imageSize} onClick={saveCrop} type="button">
            <Check aria-hidden="true" size={17} />
            {saving ? "Saving image…" : "Save image"}
          </button>
        </div>
      </section>
    </div>
  );
}
