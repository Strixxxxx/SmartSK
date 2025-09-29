
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AxiosProgressEvent } from 'axios';
import api from '../../../backend connection/axiosConfig';
import './CreatePostModal.css';

interface IFormInput {
    title: string;
    description: string;
    attachments: FileList;
}

interface CreatePostModalProps {
    onClose: () => void;
    onPostCreated: () => void;
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({ onClose, onPostCreated }) => {
    const { register, handleSubmit, formState: { errors } } = useForm<IFormInput>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previews, setPreviews] = useState<string[]>([]);
    const [uploadProgress, setUploadProgress] = useState(0);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const newPreviews = Array.from(files).map(file => URL.createObjectURL(file));
            setPreviews(newPreviews);
        }
    };

    const onSubmit = async (data: IFormInput) => {
        setIsSubmitting(true);
        setError(null);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('title', data.title);
        formData.append('description', data.description);

        if (data.attachments) {
            for (let i = 0; i < data.attachments.length; i++) {
                formData.append('attachments', data.attachments[i]);
            }
        }

        try {
            await api.post('/posts', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 0));
                    setUploadProgress(percentCompleted);
                }
            });
            onPostCreated();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || 'An error occurred while creating the post.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Create New Post</h2>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="form-group">
                        <label htmlFor="title">Title</label>
                        <input
                            id="title"
                            {...register('title', { required: 'Title is required' })}
                        />
                        {errors.title && <p className="error-message">{errors.title.message}</p>}
                    </div>
                    <div className="form-group">
                        <label htmlFor="description">Description</label>
                        <textarea
                            id="description"
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
                    <div className="previews">
                        {previews.map((preview, index) => (
                            <img key={index} src={preview} alt="Preview" className="preview-image" />
                        ))}
                    </div>
                    {isSubmitting && (
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                    )}
                    {error && <p className="error-message">{error}</p>}
                    <div className="form-actions">
                        <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? `Uploading ${uploadProgress}%` : 'Create Post'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreatePostModal;
