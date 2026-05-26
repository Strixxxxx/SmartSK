import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CircularProgress from '@mui/material/CircularProgress';
import styles from './CheckpointProofUploadModal.module.css';
import { FilePreviewModal } from './FilePreviewModal';

const CHECKPOINT_FOLDER_MAP: Record<number, string> = {
    4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve'
};

interface ProofFile {
    name: string;
    path: string;
    url: string;
    size: number;
    uploadedAt: string;
    attempt?: string;
}

interface CheckpointProofUploadModalProps {
    open: boolean;
    batchID: number;
    checkpointID: number;
    onClose: () => void;
}

const CheckpointProofUploadModal: React.FC<CheckpointProofUploadModalProps> = ({ open, batchID, checkpointID, onClose }) => {
    const [files, setFiles] = useState<ProofFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);

    const fetchFiles = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/project-tracker/checkpoint-proof/${batchID}/${checkpointID}`);
            if (res.data.success) {
                setFiles(res.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch proof files', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchFiles();
            setSelectedFile(null);
        }
    }, [open, batchID, checkpointID]);

    if (!open) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.webm', '.pdf'];
            const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            if (!allowedExtensions.includes(fileExt)) {
                alert('Invalid file format. Only png, jpg, jpeg, webp, webm, and pdf files are allowed.');
                e.target.value = '';
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        
        const formData = new FormData();
        formData.append('batchID', batchID.toString());
        formData.append('checkpointID', checkpointID.toString());
        formData.append('proofFile', selectedFile);

        try {
            setUploading(true);
            const res = await axios.post('/api/project-tracker/upload-checkpoint-proof', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            if (res.data.success) {
                setSelectedFile(null);
                const fileInput = document.getElementById('proofFileInput') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
                await fetchFiles();
            }
        } catch (error) {
            console.error('Upload failed', error);
            alert('Failed to upload proof file.');
        } finally {
            setUploading(false);
        }
    };

    const handlePreview = (e: React.MouseEvent, file: ProofFile) => {
        e.preventDefault();
        setPreviewFile({ url: file.url, name: file.name });
        setPreviewOpen(true);
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-PH', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const folderName = CHECKPOINT_FOLDER_MAP[checkpointID];
    
    // Strict client-side isolation to prevent leaks from other checkpoints (fallback)
    const filteredFiles = files.filter(file => {
        if (!folderName) return false;
        return file.path.includes(`Checkpoints/${folderName}/`);
    });

    const isGrouped = checkpointID >= 8 && checkpointID <= 12;
    const groupedFiles = isGrouped ? filteredFiles.reduce((acc, file) => {
        const attempt = file.attempt || '1st';
        if (!acc[attempt]) acc[attempt] = [];
        acc[attempt].push(file);
        return acc;
    }, {} as Record<string, ProofFile[]>) : null;

    return (
        <>
            <div className={styles.modalOverlay} onClick={onClose}>
                <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                    <div className={styles.header}>
                        <h2 className={styles.title}>Upload Proof (Checkpoint {checkpointID})</h2>
                    </div>

                    <div className={styles.fileListArea}>
                        <h3 className={styles.sectionTitle}>Uploaded Files</h3>
                        {loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
                                <CircularProgress size={24} />
                            </div>
                        ) : filteredFiles.length > 0 ? (
                            isGrouped ? (
                                Object.keys(groupedFiles!).map(attempt => (
                                    <div key={attempt} style={{ marginBottom: '16px' }}>
                                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {attempt} Attempt
                                        </h4>
                                        {groupedFiles![attempt].map((file, idx) => (
                                            <div key={idx} className={styles.fileItem}>
                                                <div className={styles.fileInfo}>
                                                    <span className={styles.fileName}>
                                                        <InsertDriveFileIcon style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4, color: '#1a73e8' }} />
                                                        {file.name}
                                                    </span>
                                                    <span className={styles.fileMeta}>{formatBytes(file.size)} • {formatDate(file.uploadedAt)}</span>
                                                </div>
                                                <button className={styles.downloadBtn} onClick={(e) => handlePreview(e, file)}>
                                                    View
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ))
                            ) : (
                                filteredFiles.map((file, idx) => (
                                    <div key={idx} className={styles.fileItem}>
                                        <div className={styles.fileInfo}>
                                            <span className={styles.fileName}>
                                                <InsertDriveFileIcon style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4, color: '#1a73e8' }} />
                                                {file.name}
                                            </span>
                                            <span className={styles.fileMeta}>{formatBytes(file.size)} • {formatDate(file.uploadedAt)}</span>
                                        </div>
                                        <button className={styles.downloadBtn} onClick={(e) => handlePreview(e, file)}>
                                            View
                                        </button>
                                    </div>
                                ))
                            )
                        ) : (
                            <p className={styles.noFiles}>No proof files uploaded yet.</p>
                        )}
                    </div>

                    <div className={styles.uploadArea}>
                        <h3 className={styles.sectionTitle}>Upload New Proof</h3>
                        <input 
                            type="file" 
                            id="proofFileInput"
                            className={styles.fileInput} 
                            onChange={handleFileChange}
                            disabled={uploading}
                            accept=".png,.jpg,.jpeg,.webp,.webm,.pdf"
                        />
                    </div>

                    <div className={styles.footer}>
                        <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={uploading}>
                            Cancel
                        </button>
                        <button 
                            className={`${styles.btn} ${styles.btnPrimary}`} 
                            onClick={handleUpload} 
                            disabled={!selectedFile || uploading}
                            style={{ gap: '6px' }}
                        >
                            {uploading ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon fontSize="small" />}
                            {uploading ? 'Uploading...' : 'Upload File'}
                        </button>
                    </div>
                </div>
            </div>

            <FilePreviewModal
                open={previewOpen}
                fileName={previewFile?.name || ''}
                fileUrl={previewFile?.url || ''}
                onClose={() => setPreviewOpen(false)}
            />
        </>
    );
};

export default CheckpointProofUploadModal;
