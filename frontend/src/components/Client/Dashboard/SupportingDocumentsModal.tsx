import React, { useState, useEffect, useRef } from 'react';
import { IconButton, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField, Typography, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from '../../../backend connection/axiosConfig';
import { useAuth } from '../../../context/AuthContext';
import { toastSuccess, toastError, showMilestoneToast } from '../../../utils/ProjectCycleToast';
import styles from './SupportingDocumentsModal.module.css';

interface SupportingDocumentsModalProps {
    open: boolean;
    onClose: () => void;
    batchID: number;
    projName: string;
    onStatusChange?: () => void;
}

type CategoryType = 'PPMP_or_APP' | 'Activity_Design' | 'SK_Resolution' | 'LYDP' | 'KK_Minutes' | 'EstIncomeCert' | 'IncomeCert' | 'KK_Attendance' | 'KK_Photo_Doc' | 'YP_Notice_Letter' | 'YP_Campaign_Proof' | 'YP_Master_Dataset' | 'QCYDO_Review_Doc' | 'QC_SK_Fed_Review_Doc' | 'City_Budget_Review_Doc' | 'City_Council_Hearing_Doc' | 'Procurement_Doc' | 'SK_Session_Docs';

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
    currentStatusID?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
    'PPMP_or_APP': 'APP',
    'Activity_Design': 'Activity Designs',
    'SK_Resolution': 'SK Resolution',
    'LYDP': 'LYDP',
    'KK_Minutes': 'KK Minutes',
    'EstIncomeCert': 'Cert of Estimated Income',
    'IncomeCert': 'Cert of Income from Barangay',
    'KK_Attendance': 'KK Attendance',
    'KK_Photo_Doc': 'Photo Documentation',
    'YP_Notice_Letter': 'Notice Letter',
    'YP_Campaign_Proof': 'Campaign Proof',
    'YP_Master_Dataset': 'Master Dataset',
    'QCYDO_Review_Doc': 'QCYDO Review Document',
    'QC_SK_Fed_Review_Doc': 'QC SK Federation Review Document',
    'City_Budget_Review_Doc': 'City Budget Review Document',
    'City_Council_Hearing_Doc': 'City Council Hearing Document',
    'Procurement_Doc': 'Procurement Document',
    'SK_Session_Docs': 'Session Documents'
};

const SupportingDocumentsModal: React.FC<SupportingDocumentsModalProps> = ({ open, onClose, batchID, projName, onStatusChange }) => {
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [docData, setDocData] = useState<ProjectDocumentsResponse | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
    const [selectedFileForUpload, setSelectedFileForUpload] = useState<File | null>(null);
    const [confirmUploadOpen, setConfirmUploadOpen] = useState(false);
    const [confirmSkResUploadOpen, setConfirmSkResUploadOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { user } = useAuth();
    
    // Preview Modal State
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [previewFileType, setPreviewFileType] = useState<'pdf' | 'image' | ''>('');
    const [previewFileName, setPreviewFileName] = useState<string>('');
    const [previewCategory, setPreviewCategory] = useState<CategoryType | null>(null);

    // Budget Validation State
    const [budgetInput, setBudgetInput] = useState<string>('');
    const [isValidatingOCR, setIsValidatingOCR] = useState(false);
    const [ocrWarningModalOpen, setOcrWarningModalOpen] = useState(false);
    const [ocrWarningMessage, setOcrWarningMessage] = useState('');
    const [budgetConfirmModalOpen, setBudgetConfirmModalOpen] = useState(false);
    const [isSavingBudget, setIsSavingBudget] = useState(false);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/project-documents/${batchID}`);
            if (res.data.success) {
                setDocData(res.data.data);
                // Apply Checkpoint Visibility Rules
                const statusID = res.data.data.currentStatusID || 0;
                let filteredCats: CategoryType[] = [];

                if (res.data.data.categories) {
                    const allCats = Object.keys(res.data.data.categories) as CategoryType[];
                    filteredCats = allCats.filter(cat => {
                        if (cat === 'Procurement_Doc') return statusID >= 12;
                        if (cat === 'City_Council_Hearing_Doc') return statusID >= 11;
                        if (cat === 'City_Budget_Review_Doc') return statusID >= 10;
                        if (cat === 'QC_SK_Fed_Review_Doc') return statusID >= 9;
                        if (cat === 'QCYDO_Review_Doc') return statusID >= 8;
                        if (cat === 'SK_Resolution') return statusID >= 6;
                        if (cat === 'EstIncomeCert' || cat === 'IncomeCert') return statusID >= 5;
                        if (cat === 'KK_Minutes' || cat === 'KK_Attendance' || cat === 'KK_Photo_Doc') return statusID >= 4;
                        if (cat === 'SK_Session_Docs') return statusID >= 3;
                        if (cat === 'LYDP') return statusID >= 2;
                        if (cat === 'YP_Notice_Letter' || cat === 'YP_Campaign_Proof' || cat === 'YP_Master_Dataset') return statusID >= 1;
                        return false;
                    });

                    // Only keep the allowed categories in the state so the tabs don't render
                    const filteredCategoriesData: any = {};
                    filteredCats.forEach(c => {
                        filteredCategoriesData[c] = res.data.data.categories[c];
                    });
                    res.data.data.categories = filteredCategoriesData;
                }

                setDocData(res.data.data);

                // Auto-select first category if none selected
                if (!selectedCategory && filteredCats.length > 0) {
                    setSelectedCategory(filteredCats[0]);
                } else if (!filteredCats.includes(selectedCategory as CategoryType)) {
                    setSelectedCategory(filteredCats.length > 0 ? filteredCats[0] : null);
                }
            }
        } catch (error) {
            console.error('Failed to fetch documents:', error);
            toastError('Failed to load documents.');
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
            setSelectedFileForUpload(null);
        }
    }, [open, batchID]);

    const handleUploadClick = () => {
        if (!selectedFileForUpload || !selectedCategory) return;
        if (selectedCategory === 'LYDP') {
            if (user?.position !== 'SKC') {
                toastError('Only the SK Chairperson can upload the LYDP.');
                setSelectedFileForUpload(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
            setConfirmUploadOpen(true);
        } else if (selectedCategory === 'SK_Resolution') {
            if (user?.position !== 'SKC') {
                toastError('Only the SK Chairperson can upload the SK Resolution.');
                setSelectedFileForUpload(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
            setConfirmSkResUploadOpen(true);
        } else {
            executeUpload();
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedCategory) return;

        // Validation for allowed file types
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const fileName = file.name.toLowerCase();
        const isAllowed = allowedExtensions.some(ext => fileName.endsWith(ext)) || file.type.startsWith('image/');

        if (!isAllowed) {
            toastError('Only PDF, DOCS, and image formats are allowed.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setSelectedFileForUpload(file);
    };

    const executeUpload = async () => {
        if (!selectedFileForUpload || !selectedCategory) return;
        setUploading(true);
        setConfirmUploadOpen(false);

        const formData = new FormData();
        const timestamp = new Date().getTime();
        const extension = selectedFileForUpload.name.substring(selectedFileForUpload.name.lastIndexOf('.'));
        const baseName = selectedFileForUpload.name.substring(0, selectedFileForUpload.name.lastIndexOf('.'));
        const newFileName = `${baseName}_${timestamp}${extension}`;
        
        const fileToUpload = new File([selectedFileForUpload], newFileName, { type: selectedFileForUpload.type });
        formData.append('document', fileToUpload);
        formData.append('category', selectedCategory);

        try {
            const res = await axios.post(`/api/project-documents/${batchID}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                await fetchDocuments();
                if (onStatusChange) onStatusChange();
                setSelectedFileForUpload(null);
                if (fileInputRef.current) fileInputRef.current.value = '';

                if (selectedCategory === 'SK_Resolution' && docData?.currentStatusID === 6) {
                    try {
                        await axios.post('/api/project-batch/update-status', {
                            batchID: batchID,
                            statusID: 7,
                        });
                        showMilestoneToast(7, user?.position || user?.role || '', projName);
                        if (onStatusChange) onStatusChange();
                    } catch (error) {
                        console.error('Failed to advance to Checkpoint 7:', error);
                        toastError('Uploaded SK Resolution successfully, but failed to auto-advance to Checkpoint 7.');
                    }
                }
            }
        } catch (error: any) {
            toastError(error.response?.data?.message || 'Failed to upload document.');
            setSelectedFileForUpload(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } finally {
            setUploading(false);
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
                if (onStatusChange) onStatusChange();
            }
        } catch (error) {
            toastError('Failed to delete document.');
        }
    };

    const handleDownload = async (documentPath: string) => {
        try {
            const res = await axios.get(`/api/project-documents/${batchID}/download`, {
                params: { documentPath }
            });
            if (res.data.success && res.data.url) {
                // Fetch the blob from the SAS URL to force a download
                const response = await fetch(res.data.url);
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                const parts = documentPath.split('/');
                a.download = parts[parts.length - 1] || 'downloaded_file';
                
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(blobUrl);
                document.body.removeChild(a);
            }
        } catch (error) {
            toastError('Failed to get download link.');
        }
    };

    const handlePreview = async (documentPath: string, fileName: string) => {
        const lowerName = fileName.toLowerCase();
        const isPdf = lowerName.endsWith('.pdf');
        const isImage = lowerName.match(/\.(jpg|jpeg|png|gif|webp)$/);

        if (!isPdf && !isImage) {
            toastError('Preview is only available for PDF and image files. Please download the file instead.');
            return;
        }

        try {
            const res = await axios.get(`/api/project-documents/${batchID}/download`, {
                params: { documentPath }
            });
            if (res.data.success && res.data.url) {
                setPreviewUrl(res.data.url);
                setPreviewFileType(isPdf ? 'pdf' : 'image');
                setPreviewFileName(fileName);
                setPreviewCategory(selectedCategory);
                setBudgetInput('');
                setBudgetConfirmModalOpen(false);
                setOcrWarningModalOpen(false);
                setPreviewModalOpen(true);
            }
        } catch (error) {
            console.error('Failed to load preview:', error);
            toastError('Failed to load preview.');
        }
    };

    const handleValidateBudget = async () => {
        const numericBudget = parseFloat(budgetInput.replace(/,/g, ''));
        if (isNaN(numericBudget) || numericBudget <= 0) {
            toastError('Please enter a valid positive number for the budget.');
            return;
        }

        setIsValidatingOCR(true);
        try {
            const response = await fetch(previewUrl);
            const blob = await response.blob();
            const file = new File([blob], previewFileName, { type: blob.type });

            const formData = new FormData();
            formData.append('document', file);

            const ocrRes = await axios.post(`/api/project-documents/${batchID}/ocr-preview`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (ocrRes.data.success && ocrRes.data.extractedBudget) {
                const extractedBudget = parseFloat(ocrRes.data.extractedBudget);
                if (extractedBudget !== numericBudget) {
                    setOcrWarningMessage(`The entered amount (₱${numericBudget.toLocaleString()}) does not match the amount extracted from the file (₱${extractedBudget.toLocaleString()}). Please type the exact amount.`);
                    setOcrWarningModalOpen(true);
                    setIsValidatingOCR(false);
                    return;
                }
            } else if (ocrRes.data.ocrFailed) {
                setOcrWarningMessage(ocrRes.data.message || 'OCR extraction failed. Please ensure you uploaded a clear document with the exact budget format.');
                setOcrWarningModalOpen(true);
                setIsValidatingOCR(false);
                return;
            } else if (!ocrRes.data.success) {
                setOcrWarningMessage(ocrRes.data.message || 'Validation failed. Please try again.');
                setOcrWarningModalOpen(true);
                setIsValidatingOCR(false);
                return;
            }

            setBudgetConfirmModalOpen(true);
        } catch (error: any) {
            setOcrWarningMessage('Failed to validate the document with the server. Please check your connection and try again.');
            setOcrWarningModalOpen(true);
        } finally {
            setIsValidatingOCR(false);
        }
    };

    const handleSaveBudget = async () => {
        const numericBudget = parseFloat(budgetInput.replace(/,/g, ''));
        setIsSavingBudget(true);
        try {
            const res = await axios.patch(`/api/project-batch/${batchID}/budget`, {
                budget: numericBudget
            });
            if (res.data.success) {
                toastSuccess('Budget successfully recorded!');
                setBudgetConfirmModalOpen(false);
                setPreviewModalOpen(false);
                fetchDocuments();
                if (onStatusChange) onStatusChange();
            }
        } catch (error: any) {
            toastError(error.response?.data?.message || 'Failed to save budget.');
        } finally {
            setIsSavingBudget(false);
        }
    };

    if (!open) return null;

    const availableCategories = docData ? Object.keys(docData.categories) as CategoryType[] : [];
    const ATTEMPT_CATEGORIES = ['YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset', 'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 'QCYDO_Review_Doc', 'QC_SK_Fed_Review_Doc', 'City_Budget_Review_Doc', 'City_Council_Hearing_Doc', 'Procurement_Doc'];
    let currentFiles = (selectedCategory && docData?.categories[selectedCategory]) || [];
    
    if (selectedCategory && ATTEMPT_CATEGORIES.includes(selectedCategory)) {
        currentFiles = [...currentFiles].sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime());
        currentFiles = currentFiles.map((f, idx) => ({
            ...f,
            name: `Attempt ${idx + 1} - ${f.name.replace(/_\d{13}(\.[^.]+)$/, '$1')}`,
            originalName: f.name // Store original name for downloading/previewing
        }));
    } else {
        currentFiles = currentFiles.map(f => ({
            ...f,
            name: f.name.replace(/_\d{13}(\.[^.]+)$/, '$1'),
            originalName: f.name
        }));
    }

    const isSkc = user?.role === 'SKC' || user?.position?.toLowerCase().includes('chairperson') || user?.position?.toUpperCase() === 'SKC';
    const isBcpt = user?.role === 'BCPT' || user?.position?.toLowerCase().includes('captain') || user?.position?.toUpperCase() === 'BCPT';
    const hasDocsControl = isSkc || user?.permissions?.docsControl === true;

    const READ_ONLY_CATEGORIES = [
        'KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc', 
        'YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset',
        'SK_Session_Docs'
    ];

    const canUpload = () => {
        if (!selectedCategory || isBcpt || !hasDocsControl) return false;
        if (READ_ONLY_CATEGORIES.includes(selectedCategory)) return false;
        
        const statusID = docData?.currentStatusID || 0;
        if (selectedCategory === 'LYDP') return statusID === 2;
        if (selectedCategory === 'EstIncomeCert' || selectedCategory === 'IncomeCert') return statusID === 5;
        if (selectedCategory === 'SK_Resolution') return statusID === 6;
        if (selectedCategory === 'QCYDO_Review_Doc') return statusID === 8;
        if (selectedCategory === 'QC_SK_Fed_Review_Doc') return statusID === 9;
        if (selectedCategory === 'City_Budget_Review_Doc') return statusID === 10;
        if (selectedCategory === 'City_Council_Hearing_Doc') return statusID === 11;
        if (selectedCategory === 'Procurement_Doc') return statusID === 12;
        return true;
    };

    const CHECKPOINT_GROUPS = [
        {
            checkpoint: 12,
            label: 'Checkpoint 12: Procurement Phase',
            categories: ['Procurement_Doc']
        },
        {
            checkpoint: 11,
            label: 'Checkpoint 11: City Council Budget Hearing',
            categories: ['City_Council_Hearing_Doc']
        },
        {
            checkpoint: 10,
            label: 'Checkpoint 10: City Budget Review',
            categories: ['City_Budget_Review_Doc']
        },
        {
            checkpoint: 9,
            label: 'Checkpoint 9: QC SK Federation Review',
            categories: ['QC_SK_Fed_Review_Doc']
        },
        {
            checkpoint: 8,
            label: 'Checkpoint 8: QCYDO Review',
            categories: ['QCYDO_Review_Doc']
        },
        {
            checkpoint: 6,
            label: 'Checkpoint 6: SK Resolution',
            categories: ['SK_Resolution']
        },
        {
            checkpoint: 5,
            label: 'Checkpoint 5: ABYIP Budget Draft',
            categories: ['EstIncomeCert', 'IncomeCert']
        },
        {
            checkpoint: 4,
            label: 'Checkpoint 4: KK General Assembly',
            categories: ['KK_Minutes', 'KK_Attendance', 'KK_Photo_Doc']
        },
        {
            checkpoint: 3,
            label: 'Checkpoint 3: SK Session',
            categories: ['SK_Session_Docs']
        },
        {
            checkpoint: 2,
            label: 'Checkpoint 2: CBYDP Drafting',
            categories: ['LYDP']
        },
        {
            checkpoint: 1,
            label: 'Checkpoint 1: Youth Profiling',
            categories: ['YP_Notice_Letter', 'YP_Campaign_Proof', 'YP_Master_Dataset']
        }
    ];

    const showUpload = canUpload();

    return (
        <>
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
                            {CHECKPOINT_GROUPS.map(group => {
                                const groupCategories = group.categories.filter(cat => availableCategories.includes(cat as CategoryType));
                                if (groupCategories.length === 0) return null;
                                
                                return (
                                    <div key={group.checkpoint} style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#556270', padding: '0 12px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {group.label}
                                        </div>
                                        {groupCategories.map(cat => (
                                            <div
                                                key={cat}
                                                className={`${styles.folderItem} ${selectedCategory === cat ? styles.active : ''}`}
                                                onClick={() => setSelectedCategory(cat as CategoryType)}
                                                style={{ marginLeft: '8px' }}
                                            >
                                                <FolderIcon className={styles.folderIcon} />
                                                <span>{CATEGORY_LABELS[cat] || cat}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Main Content */}
                        <div className={styles.mainContent}>
                            {availableCategories.length === 0 ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#88939e', fontSize: '1rem', fontStyle: 'italic' }}>
                                    No supporting documents are required at this stage.
                                </div>
                            ) : (
                                <>
                                    <div className={styles.contentHeader}>
                                        <h3>{selectedCategory ? CATEGORY_LABELS[selectedCategory] : 'Select a folder'}</h3>
                                {showUpload && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {selectedFileForUpload && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '10px' }}>
                                                <span style={{ fontSize: '14px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {selectedFileForUpload.name}
                                                </span>
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                                                    onClick={handleUploadClick}
                                                    disabled={uploading}
                                                >
                                                    Upload
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    color="inherit"
                                                    size="small"
                                                    onClick={() => { setSelectedFileForUpload(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                                    disabled={uploading}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        )}
                                        {!selectedFileForUpload && (
                                            <Button
                                                variant="outlined"
                                                startIcon={<InsertDriveFileIcon />}
                                                className={styles.uploadButton}
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={!selectedCategory || uploading}
                                            >
                                                Select File
                                            </Button>
                                        )}
                                    </div>
                                )}
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
                                            <InsertDriveFileIcon 
                                                className={styles.fileIcon} 
                                                style={{ color: file.name.endsWith('.pdf') ? '#ea4335' : file.name.endsWith('.xlsx') ? '#34a853' : '#4285f4', cursor: 'pointer' }} 
                                                onClick={() => handlePreview(file.path, (file as any).originalName || file.name)}
                                            />
                                            <div 
                                                className={styles.fileName} 
                                                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                onClick={() => handlePreview(file.path, (file as any).originalName || file.name)}
                                            >
                                                {file.name}
                                            </div>
                                            <div className={styles.fileMeta}>
                                                {(file.size / 1024).toFixed(1)} KB
                                                <br />
                                                {new Date(file.lastModified).toLocaleDateString()}
                                            </div>
                                            <div className={styles.fileActions}>
                                                <IconButton size="small" onClick={() => handleDownload(file.path)}>
                                                    <DownloadIcon fontSize="small" />
                                                </IconButton>
                                                {showUpload && (selectedCategory !== 'LYDP' || currentFiles.length >= 2) && (
                                                    <IconButton size="small" onClick={() => handleDelete(file.path)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
                    </div>
                )}
            </div>
            </div>

            {/* LYDP Upload Confirmation Dialog */}
            <Dialog open={confirmUploadOpen} onClose={() => setConfirmUploadOpen(false)}>
                <DialogTitle>Confirm LYDP Upload</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        If you upload a wrong file, please upload the correct one first. The delete button will appear once there are 2 or more LYDP files, allowing you to delete the incorrect one. It will be hidden again when only 1 LYDP file remains.
                        <br /><br />
                        Continue with upload?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmUploadOpen(false)} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={executeUpload} color="primary" variant="contained" disabled={uploading}>
                        {uploading ? 'Uploading...' : 'Continue'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* SK Resolution Upload Confirmation Dialog */}
            <Dialog open={confirmSkResUploadOpen} onClose={() => setConfirmSkResUploadOpen(false)}>
                <DialogTitle>Confirm SK Resolution Upload</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure this is the correct SK Resolution file? Uploading this will automatically advance the project cycle to Checkpoint 7: Barangay Captain's Approval.
                        <br /><br />
                        Continue with upload?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmSkResUploadOpen(false)} color="inherit">
                        Cancel
                    </Button>
                    <Button 
                        onClick={() => {
                            setConfirmSkResUploadOpen(false);
                            executeUpload();
                        }} 
                        color="primary" 
                        variant="contained" 
                        disabled={uploading}
                    >
                        {uploading ? 'Uploading...' : 'Continue'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Document Preview & Budget Modal */}
            <Dialog 
                open={previewModalOpen && !budgetConfirmModalOpen} 
                onClose={() => setPreviewModalOpen(false)} 
                maxWidth="lg" 
                fullWidth
                disableEscapeKeyDown={isValidatingOCR}
                sx={{ '& .MuiDialog-paper': { height: '85vh', maxHeight: '900px' } }}
            >
                <DialogTitle>
                    {previewCategory === 'EstIncomeCert' ? 'Certified SK Fund Allocation' : 'Document Preview'}
                    <IconButton onClick={() => setPreviewModalOpen(false)} style={{ position: 'absolute', right: 8, top: 8 }} disabled={isValidatingOCR}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 2 }}>
                    <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, border: '1px solid #ccc', borderRadius: 1, overflow: 'hidden', mb: previewCategory === 'EstIncomeCert' ? 2 : 0, mt: 1 }}>
                        {previewFileType === 'pdf' ? (
                            <iframe src={previewUrl} width="100%" height="100%" style={{ border: 'none' }} title="Document Preview" />
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', backgroundColor: '#f5f5f5' }}>
                                <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                        )}
                    </Box>

                    {previewCategory === 'EstIncomeCert' && isSkc && (
                        <Box sx={{ flexShrink: 0 }}>
                            <Typography sx={{ mb: 2 }}>
                                Please enter the Certified SK Fund Allocation extracted from this document for the ABYIP.
                            </Typography>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                <TextField
                                    autoFocus
                                    margin="dense"
                                    label="Certified SK Fund Allocation (PHP)"
                                    type="number"
                                    fullWidth
                                    variant="outlined"
                                    value={budgetInput}
                                    onChange={(e) => setBudgetInput(e.target.value)}
                                    disabled={isValidatingOCR}
                                    InputProps={{
                                        startAdornment: <Typography sx={{ mr: 1 }}>₱</Typography>
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && budgetInput.trim() && !isValidatingOCR) {
                                            handleValidateBudget();
                                        }
                                    }}
                                    sx={{ mt: 0 }}
                                />
                                <Button 
                                    onClick={handleValidateBudget} 
                                    color="primary" 
                                    variant="contained" 
                                    disabled={!budgetInput.trim() || isValidatingOCR}
                                    startIcon={isValidatingOCR ? <CircularProgress size={20} color="inherit" /> : null}
                                    sx={{ mt: 0, height: '56px', px: 4 }}
                                >
                                    {isValidatingOCR ? 'Validating...' : 'Confirm'}
                                </Button>
                            </div>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            {/* Budget Allocation Confirmation Modal */}
            <Dialog 
                open={budgetConfirmModalOpen} 
                onClose={(_event, reason) => {
                    if (reason === 'backdropClick') return;
                    if (!isSavingBudget) setBudgetConfirmModalOpen(false);
                }} 
                maxWidth="xs" 
                fullWidth
            >
                <DialogTitle>Confirm Allocation</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Is this the correct certified SK fund allocation?
                        <br /><br />
                        <Typography variant="h6" color="primary" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                            ₱{parseFloat(budgetInput.replace(/,/g, '') || '0').toLocaleString()}
                        </Typography>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBudgetConfirmModalOpen(false)} color="inherit" disabled={isSavingBudget}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSaveBudget} 
                        color="primary" 
                        variant="contained" 
                        disabled={isSavingBudget}
                        startIcon={isSavingBudget ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isSavingBudget ? 'Saving...' : 'Yes, Confirm'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* OCR Warning Modal */}
            <Dialog 
                open={ocrWarningModalOpen} 
                onClose={() => setOcrWarningModalOpen(false)} 
                maxWidth="xs" 
                fullWidth
            >
                <DialogTitle sx={{ color: '#ef4444', fontWeight: 'bold' }}>Validation Failed</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {ocrWarningMessage}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOcrWarningModalOpen(false)} variant="contained" color="error">
                        Understood
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default SupportingDocumentsModal;
