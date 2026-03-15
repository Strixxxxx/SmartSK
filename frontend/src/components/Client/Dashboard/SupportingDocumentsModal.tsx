import React, { useState, useEffect, useRef } from 'react';
import { IconButton, Button, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from '../../../backend connection/axiosConfig';
import styles from './SupportingDocumentsModal.module.css';

interface SupportingDocumentsModalProps {
    open: boolean;
    onClose: () => void;
    batchID: number;
    projName: string;
}

type CategoryType = 'PPMP_or_APP' | 'Activity_Design' | 'SK_Resolution' | 'LYDP' | 'KK_Minutes' | 'Youth_Profile';

interface DocumentFile {
    name: string;
    path: string;
    size: number;
    lastModified: string;
}

interface ProjectDocumentsResponse {
    projName: string;
    projType: 'ABYIP' | 'CBYDP';
    categories: {
        [key in CategoryType]?: DocumentFile[];
    };
}

const CATEGORY_LABELS: Record<string, string> = {
    'PPMP_or_APP': 'APP',
    'Activity_Design': 'Activity Designs',
    'SK_Resolution': 'SK Resolution',
    'LYDP': 'LYDP',
    'KK_Minutes': 'Consultation Minutes',
    'Youth_Profile': 'Youth Profile'
};

const SupportingDocumentsModal: React.FC<SupportingDocumentsModalProps> = ({ open, onClose, batchID, projName }) => {
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [docData, setDocData] = useState<ProjectDocumentsResponse | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/project-documents/${batchID}`);
            if (res.data.success) {
                setDocData(res.data.data);
                // Auto-select first category if none selected
                if (!selectedCategory && res.data.data.categories) {
                    const availableCats = Object.keys(res.data.data.categories) as CategoryType[];
                    if (availableCats.length > 0) {
                        setSelectedCategory(availableCats[0]);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch documents:', error);
            alert('Failed to load documents.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchDocuments();
        } else {
            // Reset state on close
            setDocData(null);
            setSelectedCategory(null);
        }
    }, [open, batchID]);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedCategory) return;

        // Validation for allowed file types
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const fileName = file.name.toLowerCase();
        const isAllowed = allowedExtensions.some(ext => fileName.endsWith(ext)) || file.type.startsWith('image/');

        if (!isAllowed) {
            alert('Only PDF, DOCS, and image formats are allowed.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('document', file);
        formData.append('category', selectedCategory);

        try {
            const res = await axios.post(`/api/project-documents/${batchID}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                await fetchDocuments();
            }
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to upload document.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (documentPath: string) => {
        if (!window.confirm('Are you sure you want to delete this document?')) return;

        try {
            const res = await axios.delete(`/api/project-documents/${batchID}/delete`, {
                data: { documentPath }
            });
            if (res.data.success) {
                await fetchDocuments();
            }
        } catch (error) {
            alert('Failed to delete document.');
        }
    };

    const handleDownload = async (documentPath: string) => {
        try {
            const res = await axios.get(`/api/project-documents/${batchID}/download`, {
                params: { documentPath }
            });
            if (res.data.success && res.data.url) {
                window.open(res.data.url, '_blank');
            }
        } catch (error) {
            alert('Failed to get download link.');
        }
    };

    if (!open) return null;

    const availableCategories = docData ? Object.keys(docData.categories) as CategoryType[] : [];
    const currentFiles = (selectedCategory && docData?.categories[selectedCategory]) || [];

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>Supporting Documents: {projName}</h2>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </div>

                {loading && !docData ? (
                    <div className={styles.loadingState}>
                        <CircularProgress />
                    </div>
                ) : (
                    <div className={styles.modalBody}>
                        {/* Sidebar */}
                        <div className={styles.sidebar}>
                            {availableCategories.map(cat => (
                                <div
                                    key={cat}
                                    className={`${styles.folderItem} ${selectedCategory === cat ? styles.active : ''}`}
                                    onClick={() => setSelectedCategory(cat)}
                                >
                                    <FolderIcon className={styles.folderIcon} />
                                    <span>{CATEGORY_LABELS[cat] || cat}</span>
                                </div>
                            ))}
                        </div>

                        {/* Main Content */}
                        <div className={styles.mainContent}>
                            <div className={styles.contentHeader}>
                                <h3>{selectedCategory ? CATEGORY_LABELS[selectedCategory] : 'Select a folder'}</h3>
                                <Button
                                    variant="contained"
                                    startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                                    className={styles.uploadButton}
                                    onClick={handleUploadClick}
                                    disabled={!selectedCategory || uploading}
                                >
                                    Upload File
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className={styles.hiddenInput}
                                    onChange={handleFileChange}
                                    accept=".pdf,.doc,.docx,image/*"
                                />
                            </div>

                            {selectedCategory && currentFiles.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <InsertDriveFileIcon style={{ fontSize: 64, color: '#e0e0e0' }} />
                                    <p>No documents found in this folder.</p>
                                </div>
                            ) : (
                                <div className={styles.fileGrid}>
                                    {currentFiles.map(file => (
                                        <div key={file.path} className={styles.fileCard}>
                                            <InsertDriveFileIcon className={styles.fileIcon} style={{ color: file.name.endsWith('.pdf') ? '#ea4335' : file.name.endsWith('.xlsx') ? '#34a853' : '#4285f4' }} />
                                            <div className={styles.fileName}>{file.name}</div>
                                            <div className={styles.fileMeta}>
                                                {(file.size / 1024).toFixed(1)} KB
                                                <br />
                                                {new Date(file.lastModified).toLocaleDateString()}
                                            </div>
                                            <div className={styles.fileActions}>
                                                <DownloadIcon className={styles.actionIcon} onClick={() => handleDownload(file.path)} />
                                                <DeleteIcon className={`${styles.actionIcon} ${styles.deleteIcon}`} onClick={() => handleDelete(file.path)} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SupportingDocumentsModal;
