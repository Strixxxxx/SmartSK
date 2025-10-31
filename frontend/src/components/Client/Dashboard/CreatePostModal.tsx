import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { AxiosProgressEvent } from 'axios';
import api from '../../../backend connection/axiosConfig';
import './CreatePostModal.css';
import VideoPreviewModal from './VideoPreviewModal';
import ViewOptionModal from './ViewOption';
import PdfPreviewModal from './PdfPreviewModal';
import { toast } from 'react-toastify';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

interface IFormInput {
    title: string;
    description: string;
    attachments?: FileList;
    secure_attachments?: FileList;
}

interface Project {
    projectID: number;
    title: string;
    reference_number: string;
}

interface ViewOptions {
    opforPubProj: boolean;
    opforAllBrgyProj: boolean;
    opforBrgyProj: boolean;
    opforPubEAttach: boolean;
    opforAllBrgyEAttach: boolean;
    opforBrgyEAttach: boolean;
}

interface CreatePostModalProps {
    onClose: () => void;
    onPostCreated: () => void;
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({ onClose, onPostCreated }) => {
    const { register, handleSubmit, formState: { errors }, trigger, getValues } = useForm<IFormInput>({ mode: 'onChange' });
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previews, setPreviews] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [secureFiles, setSecureFiles] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showVideoWarning, setShowVideoWarning] = useState(false);

    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const [selectedVideoUrl, setSelectedVideoUrl] = useState('');
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [selectedPdfUrl, setSelectedPdfUrl] = useState('');
    const [selectedPdfName, setSelectedPdfName] = useState('');
    const [userProjects, setUserProjects] = useState<Project[]>([]);
    const [taggedProjects, setTaggedProjects] = useState<number[]>([]);
    const [viewOptions, setViewOptions] = useState<ViewOptions>({
        opforPubProj: true, opforAllBrgyProj: false, opforBrgyProj: false,
        opforPubEAttach: true, opforAllBrgyEAttach: false, opforBrgyEAttach: false
    });
    const [isViewOptionsModalOpen, setIsViewOptionsModalOpen] = useState(false);
    const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const pollingInterval = useRef<number | null>(null);
    const tagDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchUserProjects = async () => {
            try {
                const response = await api.get('/api/tagged-projects/for-tagging');
                if (response.data.success) {
                    setUserProjects(response.data.projects);
                }
            } catch (error) {
                console.error("Failed to fetch user projects", error);
            }
        };
        fetchUserProjects();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
                setIsTagDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);



    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const newFilesArray = Array.from(files);
            if (newFilesArray.some(file => file.type.startsWith('video'))) {
                setShowVideoWarning(true);
            }
            setSelectedFiles(prevFiles => [...prevFiles, ...newFilesArray]);
            setPreviews(prevPreviews => [...prevPreviews, ...newFilesArray.map(file => URL.createObjectURL(file))]);
        }
    };

    const handleSecureFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            setSecureFiles(prevFiles => [...prevFiles, ...Array.from(files)]);
        }
    };

    const handleRemoveFile = (indexToRemove: number) => {
        URL.revokeObjectURL(previews[indexToRemove]);
        setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
        setPreviews(prev => prev.filter((_, index) => index !== indexToRemove));
        if (!selectedFiles.some(file => file.type.startsWith('video'))) {
            setShowVideoWarning(false);
        }
    };

    const handleRemoveSecureFile = (indexToRemove: number) => {
        setSecureFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null) {
            const reorder = <T,>(list: T[]) => {
                const result = [...list];
                const [removed] = result.splice(dragItem.current!, 1);
                result.splice(dragOverItem.current!, 0, removed);
                return result;
            };
            setSelectedFiles(reorder(selectedFiles));
            setPreviews(reorder(previews));
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleViewPdf = (file: File) => {
        const fileUrl = URL.createObjectURL(file);
        setSelectedPdfUrl(fileUrl);
        setSelectedPdfName(file.name);
        setIsPdfModalOpen(true);
    };

    const handleDownloadFile = (file: File) => {
        const fileUrl = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = fileUrl;
        link.setAttribute('download', file.name);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(fileUrl);
    };

    const onSubmit = async (data: IFormInput) => {
        setIsSubmitting(true);
        setUploadProgress(0);
        setJobStatus(null);
        setStatusMessage('Preparing to upload...');

        const formData = new FormData();
        formData.append('title', data.title);
        formData.append('description', data.description);
        formData.append('taggedProjects', JSON.stringify(taggedProjects));
        formData.append('viewOptions', JSON.stringify(viewOptions));
        selectedFiles.forEach(file => formData.append('attachments', file));
        secureFiles.forEach(file => formData.append('secure_attachments', file));

        try {
            await api.post('/api/create-post', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 1));
                    setUploadProgress(percentCompleted);
                    setStatusMessage(percentCompleted === 100 ? 'Upload complete. Waiting for server to process...' : `Uploading... ${percentCompleted}%`);
                }
            });
            // Fire-and-forget: Close modal and show initial toast
            onClose();
            toast.info('Post creation started! We will notify you upon completion. Please do not log out.', { autoClose: 10000 });
            onPostCreated(); // Refresh the feed to show a pending post if desired

        } catch (err: any) {
            toast.error(err.response?.data?.message || 'An error occurred while creating the post.');
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        previews.forEach(preview => URL.revokeObjectURL(preview));
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        onClose();
    };

    const getButtonText = () => {
        if (!isSubmitting) return 'Post';
        if (jobStatus) return `Processing...`;
        if (uploadProgress < 100) return `Uploading ${uploadProgress}%`;
        return 'Finalizing...';
    };

    const getVisibilityLabel = (options: ViewOptions, type: 'proj' | 'eattach') => {
        if (type === 'proj') {
            if (options.opforPubProj) return 'Public';
            if (options.opforAllBrgyProj) return 'All Barangays';
            if (options.opforBrgyProj) return 'Barangay Only';
        } else {
            if (options.opforPubEAttach) return 'Public';
            if (options.opforAllBrgyEAttach) return 'All Barangays';
            if (options.opforBrgyEAttach) return 'Barangay Only';
        }
        return 'Default';
    };

    const renderPreviews = () => (
        <div className="previews">
            {previews.map((preview, index) => {
                const file = selectedFiles[index];
                const isVideo = file.type.startsWith('video');
                return (
                    <div 
                        key={index} 
                        className="preview-container"
                        draggable
                        onDragStart={() => dragItem.current = index}
                        onDragEnter={() => dragOverItem.current = index}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {isVideo ? (
                            <div className="video-preview" onClick={() => { setSelectedVideoUrl(preview); setIsVideoModalOpen(true); }}>
                                <video src={preview} className="preview-image" />
                                <div className="play-icon"><div className="play-icon-shape"></div></div>
                            </div>
                        ) : (
                            <img src={preview} alt={`Preview ${index + 1}`} className="preview-image" />
                        )}
                        <button type="button" className="remove-attachment-btn" onClick={() => handleRemoveFile(index)}>&times;</button>
                    </div>
                );
            })}
        </div>
    );

    return (
        <>
            <div className="modal-overlay" onClick={handleClose}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    {step === 1 ? (
                        <>
                            <h2>Create New Post</h2>
                            <form>
                                <div className="form-group">
                                    <label htmlFor="title">Title</label>
                                    <input type="text" id="title" placeholder="Enter your post title..." {...register('title', { required: 'Title is required' })} />
                                    
                                </div>
                                
                                <div className="form-group">
                                    <label htmlFor="description">Description</label>
                                    <textarea id="description" placeholder="Share your thoughts..." {...register('description', { required: 'Description is required' })} />
                                    
                                </div>

                                <div className="form-group" ref={tagDropdownRef}>
                                    <label>Tag Related Projects</label>
                                    <div className="custom-multiselect">
                                        <button type="button" onClick={() => setIsTagDropdownOpen(prev => !prev)} className="multiselect-button">
                                            {taggedProjects.length > 0 ? `${taggedProjects.length} project(s) selected` : "Select Projects to Tag"}
                                        </button>
                                        {isTagDropdownOpen && (
                                            <div className="dropdown-list">
                                                {userProjects.length > 0 ? (
                                                    userProjects.map(p => (
                                                        <div key={p.projectID} className="checkbox-item" onClick={() => setTaggedProjects(prev => prev.includes(p.projectID) ? prev.filter(id => id !== p.projectID) : [...prev, p.projectID])}>
                                                            <input type="checkbox" id={`proj-${p.projectID}`} checked={taggedProjects.includes(p.projectID)} readOnly />
                                                            <label htmlFor={`proj-${p.projectID}`}>{p.reference_number} - {p.title}</label>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="no-projects-message">You have no projects available to tag.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <a href="#" onClick={(e) => { e.preventDefault(); setIsViewOptionsModalOpen(true); }} className="view-options-link">
                                        Privacy and View Options
                                    </a>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="attachments">Public Attachments</label>
                                    <p className="input-description">For general images and videos that will be publicly visible on your post.</p>
                                    <input type="file" id="attachments" multiple accept="image/jpeg,image/png,image/jpg,video/mp4" {...register('attachments')} onChange={handleFileChange} />
                                    {showVideoWarning && <p className="video-warning">Video uploads may take a few moments to process after uploading.</p>}
                                </div>
                                {previews.length > 0 && renderPreviews()}

                                <div className="form-group">
                                    <label htmlFor="secure_attachments">Encrypted Attachments</label>
                                    <p className="input-description">For sensitive documents (receipts, PDFs, etc.). Visibility will be based on your selected options.</p>
                                    <input type="file" id="secure_attachments" multiple accept="image/jpeg,image/png,image/jpg,application/pdf,.doc,.docx" {...register('secure_attachments')} onChange={handleSecureFileChange} />
                                    {secureFiles.length > 0 && (
                                        <div className="secure-files-grid">
                                            {secureFiles.map((file, index) => {
                                                const isPdf = file.type === 'application/pdf';
                                                const isDoc = file.type.startsWith('application/msword') || file.type.startsWith('application/vnd.openxmlformats-officedocument.wordprocessingml');
                                                const isImage = file.type.startsWith('image/');
                                                const fileUrl = URL.createObjectURL(file);

                                                return (
                                                    <div key={index} className="file-card">
                                                        <div className="document-actions-cell">
                                                            {isPdf ? (
                                                                <Tooltip title="View File">
                                                                    <IconButton onClick={() => handleViewPdf(file)}>
                                                                        <VisibilityIcon />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            ) : isDoc ? (
                                                                <Tooltip title="Download File">
                                                                    <IconButton onClick={() => handleDownloadFile(file)}>
                                                                        <FileDownloadIcon />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            ) : isImage ? (
                                                                <img src={fileUrl} alt={file.name} className="file-image-preview" />
                                                            ) : (
                                                                <Tooltip title="Download File">
                                                                    <IconButton onClick={() => handleDownloadFile(file)}>
                                                                        <FileDownloadIcon />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                        <div className="file-name" title={file.name}>{file.name}</div>
                                                        <button type="button" className="remove-attachment-btn" onClick={() => handleRemoveSecureFile(index)}>&times;</button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="form-actions">
                                    <button type="button" onClick={handleClose}>Cancel</button>
                                    <button type="button" onClick={async () => {
                                        const isValid = await trigger();
                                        if (isValid) {
                                            setStep(2);
                                        } else {
                                            if (errors.title) toast.error(errors.title.message);
                                            if (errors.description) toast.error(errors.description.message);
                                        }
                                    }}>Next</button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <>
                            <h2>Post Preview</h2>
                            <div className="post-preview">
                                <h3>{getValues('title')}</h3>
                                <p>{getValues('description')}</p>
                                {previews.length > 0 && renderPreviews()}
                                
                                {taggedProjects.length > 0 && (
                                    <div className="preview-section">
                                        <h4>Tagged Projects:</h4>
                                        <ul>
                                            {userProjects.filter(p => taggedProjects.includes(p.projectID)).map(p => <li key={p.projectID}>{p.reference_number} - {p.title}</li>)}
                                        </ul>
                                    </div>
                                )}

                                <div className="preview-section">
                                    <h4>Visibility Options:</h4>
                                    <p><strong>Projects:</strong> {getVisibilityLabel(viewOptions, 'proj')}</p>
                                    <p><strong>Secure Attachments:</strong> {getVisibilityLabel(viewOptions, 'eattach')}</p>
                                </div>
                            </div>

                            {isSubmitting && (
                                <div className="status-container">
                                    <div className="progress-bar-container">
                                        <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                    <p className="status-message">{statusMessage}</p>
                                </div>
                            )}

                            <div className="form-actions">
                                <button type="button" onClick={() => setStep(1)} disabled={isSubmitting}>Back</button>
                                <button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>{getButtonText()}</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {isVideoModalOpen && <VideoPreviewModal videoUrl={selectedVideoUrl} onClose={() => { setIsVideoModalOpen(false); setSelectedVideoUrl(''); }} />}
            <ViewOptionModal isOpen={isViewOptionsModalOpen} onClose={() => setIsViewOptionsModalOpen(false)} options={viewOptions} onSave={setViewOptions} />
            {isPdfModalOpen && <PdfPreviewModal fileUrl={selectedPdfUrl} fileName={selectedPdfName} onClose={() => setIsPdfModalOpen(false)} />}
        </>
    );
};

export default CreatePostModal;