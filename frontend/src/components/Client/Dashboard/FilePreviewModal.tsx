import React, { useState } from 'react';
import styles from './FilePreviewModal.module.css';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface FilePreviewModalProps {
  open: boolean;
  fileName: string;
  fileUrl: string;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  open,
  fileName,
  fileUrl,
  onClose,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  if (!open) return null;

  const getFileType = (url: string, name: string) => {
    const combined = (url + name).toLowerCase();
    if (combined.endsWith('.pdf')) return 'pdf';
    if (combined.endsWith('.webm')) return 'video';
    if (
      combined.endsWith('.png') ||
      combined.endsWith('.jpg') ||
      combined.endsWith('.jpeg') ||
      combined.endsWith('.webp')
    ) {
      return 'image';
    }
    return 'other';
  };

  const fileType = getFileType(fileUrl, fileName);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleInfo}>
            <InsertDriveFileIcon style={{ color: '#1a73e8', fontSize: 20 }} />
            <span className={styles.fileName} title={fileName}>
              {fileName}
            </span>
          </div>
          {fileType === 'image' && (
            <div className={styles.controls}>
              <button className={styles.controlBtn} onClick={handleZoomIn} title="Zoom In">
                <ZoomInIcon fontSize="small" style={{ color: '#475569' }} />
              </button>
              <button className={styles.controlBtn} onClick={handleZoomOut} title="Zoom Out">
                <ZoomOutIcon fontSize="small" style={{ color: '#475569' }} />
              </button>
              <button className={styles.controlBtn} onClick={handleRotate} title="Rotate 90°">
                <RotateRightIcon fontSize="small" style={{ color: '#475569' }} />
              </button>
              <button className={styles.controlBtn} onClick={handleReset} title="Reset">
                <RestartAltIcon fontSize="small" style={{ color: '#475569' }} />
              </button>
            </div>
          )}
        </div>

        <div className={styles.body}>
          {fileType === 'image' && (
            <div className={styles.mediaWrapper}>
              <img
                src={fileUrl}
                alt={fileName}
                className={styles.imagePreview}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease',
                }}
              />
            </div>
          )}

          {fileType === 'video' && (
            <div className={styles.mediaWrapper}>
              <video src={fileUrl} controls autoPlay loop className={styles.videoPreview} />
            </div>
          )}

          {fileType === 'pdf' && (
            <div className={styles.pdfWrapper}>
              <iframe
                src={`${fileUrl}#toolbar=0`}
                title={fileName}
                className={styles.pdfFrame}
              />
            </div>
          )}

          {fileType === 'other' && (
            <div className={styles.unsupportedWrapper}>
              <div className={styles.fallbackBox}>
                <WarningAmberIcon style={{ color: '#f59e0b', fontSize: 48, marginBottom: 16 }} />
                <p>Preview not available for this file type.</p>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={styles.downloadLink}>
                  Download Document
                </a>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.closeBtn} onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
