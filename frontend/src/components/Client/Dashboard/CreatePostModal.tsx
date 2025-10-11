import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { AxiosProgressEvent } from 'axios';
import api from '../../../backend connection/axiosConfig';
import './CreatePostModal.css';
import VideoPreviewModal from './VideoPreviewModal';

interface IFormInput {
    title: string;
    description: string;
    attachments?: FileList;
}

interface CreatePostModalProps {
    onClose: () => void;
    onPostCreated: () => void;
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({ onClose, onPostCreated }) => {
    const { register, handleSubmit, formState: { errors }, trigger, getValues } = useForm<IFormInput>({ mode: 'onChange' });
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previews, setPreviews] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showVideoWarning, setShowVideoWarning] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('');

    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const [selectedVideoUrl, setSelectedVideoUrl] = useState('');

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (jobId) {
            setStatusMessage('Post creation has started...');
            pollingInterval.current = setInterval(pollJobStatus, 2000); // Poll every 2 seconds
        }
        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
            }
        };
    }, [jobId]);

    const pollJobStatus = async () => {
        if (!jobId) return;

        try {
            const response = await api.get(`/api/post-status/${jobId}`);
            const { job } = response.data;

            setJobStatus(job.Status);
            setStatusMessage(job.Message || 'Processing...');

            if (job.Status === 'completed') {
                if (pollingInterval.current) clearInterval(pollingInterval.current);
                previews.forEach(preview => URL.revokeObjectURL(preview));
                onPostCreated();
                onClose();
            } else if (job.Status === 'failed') {
                if (pollingInterval.current) clearInterval(pollingInterval.current);
                setError(job.ErrorMessage || 'An unknown error occurred during post processing.');
                setIsSubmitting(false);
            }
        } catch (err: any) {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            setError('Failed to get post status. Please check your connection.');
            setIsSubmitting(false);
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const newFilesArray = Array.from(files);
            if (newFilesArray.some(file => file.type.startsWith('video'))) {
                setShowVideoWarning(true);
            }
            setSelectedFiles(prevFiles => [...prevFiles, ...newFilesArray]);

            const newPreviews = newFilesArray.map(file => URL.createObjectURL(file));
            setPreviews(prevPreviews => [...prevPreviews, ...newPreviews]);
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

    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null) {
            const newSelectedFiles = [...selectedFiles];
            const draggedFile = newSelectedFiles.splice(dragItem.current, 1)[0];
            newSelectedFiles.splice(dragOverItem.current, 0, draggedFile);
            setSelectedFiles(newSelectedFiles);

            const newPreviews = [...previews];
            const draggedPreview = newPreviews.splice(dragItem.current, 1)[0];
            newPreviews.splice(dragOverItem.current, 0, draggedPreview);
            setPreviews(newPreviews);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const openVideoModal = (videoUrl: string) => {
        setSelectedVideoUrl(videoUrl);
        setIsVideoModalOpen(true);
    };

    const closeVideoModal = () => {
        setIsVideoModalOpen(false);
        setSelectedVideoUrl('');
    };

    const onSubmit = async (data: IFormInput) => {
        setIsSubmitting(true);
        setError(null);
        setUploadProgress(0);
        setJobStatus(null);
        setStatusMessage('Preparing to upload...');

        const formData = new FormData();
        formData.append('title', data.title);
        formData.append('description', data.description);

        selectedFiles.forEach(file => {
            formData.append('attachments', file);
        });

        try {
            const response = await api.post('/api/create-post', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
                    );
                    setUploadProgress(percentCompleted);
                    if (percentCompleted === 100) {
                        setStatusMessage('Upload complete. Waiting for server to process...');
                    } else {
                        setStatusMessage(`Uploading... ${percentCompleted}%`);
                    }
                }
            });
            
            setJobId(response.data.jobId);

        } catch (err: any) {
            setError(err.response?.data?.message || 'An error occurred while creating the post.');
            setIsSubmitting(false);
        }
    };

    const handleNext = async () => {
        const isValid = await trigger();
        if (isValid) setStep(2);
    };

    const handleBack = () => setStep(1);

    const handleClose = () => {
        previews.forEach(preview => URL.revokeObjectURL(preview));
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        onClose();
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
                            <div className="video-preview" onClick={() => openVideoModal(preview)}>
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

    const getButtonText = () => {
        if (!isSubmitting) return 'Post';
        if (jobId) return jobStatus ? `Processing...` : 'Finalizing...';
        if (uploadProgress < 100) return `Uploading ${uploadProgress}%`;
        return 'Processing...';
    };

    return (
        <>
            <div className="modal-overlay" onClick={handleClose}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    {step === 1 && (
                        <>
                            <h2>Create New Post</h2>
                            <form>
                                <div className="form-group">
                                    <label htmlFor="title">Title</label>
                                    <input
                                        type="text"
                                        id="title"
                                        placeholder="Enter your post title..."
                                        {...register('title', { required: 'Title is required' })}
                                    />
                                    {errors.title && <p className="error-message">{errors.title.message}</p>}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="description">Description</label>
                                    <textarea
                                        id="description"
                                        placeholder="Share your thoughts..."
                                        {...register('description', { required: 'Description is required' })}
                                    />
                                    {errors.description && <p className="error-message">{errors.description.message}</p>}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="attachments">Attachments (Images/Videos)</label>
                                    <input
                                        type="file"
                                        id="attachments"
                                        multiple
                                        accept="image/jpeg,image/png,image/jpg,video/mp4"
                                        {...register('attachments')}
                                        onChange={handleFileChange}
                                    />
                                    {showVideoWarning && <p className="video-warning">Video uploads may take a few moments to process after uploading.</p>}
                                </div>
                                {previews.length > 0 && renderPreviews()}
                                <div className="form-actions">
                                    <button type="button" onClick={handleClose}>Cancel</button>
                                    <button type="button" onClick={handleNext}>Next</button>
                                </div>
                            </form>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <h2>Post Preview</h2>
                            <div className="post-preview">
                                <h3>{getValues('title')}</h3>
                                <p>{getValues('description')}</p>
                                {previews.length > 0 && renderPreviews()}
                            </div>

                            {isSubmitting && (
                                <div className="status-container">
                                    <div className="progress-bar-container">
                                        <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                    <p className="status-message">{statusMessage}</p>
                                </div>
                            )}

                            {error && <p className="error-message">{error}</p>}

                            <div className="form-actions">
                                <button type="button" onClick={handleBack} disabled={isSubmitting}>Back</button>
                                <button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
                                    {getButtonText()}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {isVideoModalOpen && <VideoPreviewModal videoUrl={selectedVideoUrl} onClose={closeVideoModal} />}
        </>
    );
};

export default CreatePostModal;
