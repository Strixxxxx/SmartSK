import React, { useState, useRef } from 'react';
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
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previews, setPreviews] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const [selectedVideoUrl, setSelectedVideoUrl] = useState('');

    // Drag and drop state
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const newFilesArray = Array.from(files);
            setSelectedFiles(prevFiles => [...prevFiles, ...newFilesArray]);

            const newPreviews = newFilesArray.map(file => URL.createObjectURL(file));
            setPreviews(prevPreviews => [...prevPreviews, ...newPreviews]);
        }
    };

    const handleRemoveFile = (indexToRemove: number) => {
        URL.revokeObjectURL(previews[indexToRemove]);

        const updatedFiles = selectedFiles.filter((_, index) => index !== indexToRemove);
        setSelectedFiles(updatedFiles);

        const updatedPreviews = previews.filter((_, index) => index !== indexToRemove);
        setPreviews(updatedPreviews);
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

    const generatePostReference = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        return `G-${year}${month}${day}${hours}${minutes}${seconds}`;
    };

    const onSubmit = async (data: IFormInput) => {
        setIsSubmitting(true);
        setIsProcessing(false);
        setError(null);
        setUploadProgress(0);

        const formData = new FormData();
        const postReference = generatePostReference();
        formData.append('postReference', postReference);
        formData.append('title', data.title);
        formData.append('description', data.description);

        if (selectedFiles.length > 0) {
            selectedFiles.forEach(file => {
                formData.append('attachments', file);
            });
        }

        try {
            await api.post('/api/create-post', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
                    );
                    setUploadProgress(percentCompleted);
                    if (percentCompleted === 100) {
                        setIsProcessing(true);
                    }
                }
            });
            
            previews.forEach(preview => URL.revokeObjectURL(preview));
            onPostCreated();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || 'An error occurred while creating the post.');
        } finally {
            setIsSubmitting(false);
            setIsProcessing(false);
        }
    };

    const handleNext = async () => {
        const isValid = await trigger();
        if (isValid) {
            setStep(2);
        }
    };

    const handleBack = () => {
        setStep(1);
    };

    const handleClose = () => {
        previews.forEach(preview => URL.revokeObjectURL(preview));
        onClose();
    };

    const renderPreviews = () => {
        return (
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
                            <button type="button" className="remove-attachment-btn" onClick={() => handleRemoveFile(index)}>
                                &times;
                            </button>
                        </div>
                    );
                })}
            </div>
        );
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
                                </div>

                                {previews.length > 0 && renderPreviews()}

                                <div className="form-actions">
                                    <button type="button" onClick={handleClose}>
                                        Cancel
                                    </button>
                                    <button type="button" onClick={handleNext}>
                                        Next
                                    </button>
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

                            {isSubmitting && uploadProgress > 0 && (
                                <div className="progress-bar-container">
                                    <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                </div>
                            )}

                            {error && <p className="error-message">{error}</p>}

                            <div className="form-actions">
                                <button type="button" onClick={handleBack} disabled={isSubmitting}>
                                    Back
                                </button>
                                <button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
                                    {isSubmitting ? (isProcessing ? 'Processing...' : `Uploading ${uploadProgress}%`) : 'Post'}
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
