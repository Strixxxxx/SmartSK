import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import ViewOptionModal from '../Dashboard/ViewOption';
import AttachmentItem from './AttachmentItem';
import AttachmentPreviewModal from './AttachmentPreviewModal';
import Loading from '../../Loading/Loading';
import './EditPostForm.css';

// --- Interfaces ---
interface IFormInput {
    title: string;
    description: string;
}

interface Project {
    projectID: number;
    title: string;
    reference_number: string;
}

interface Attachment {
    attachmentID: number;
    filePath: string;
    fileType: string;
    isPublic: boolean;
    sasUrl?: string; // SAS URL for secure access
}

interface ViewOptions {
    opforPubProj: boolean;
    opforAllBrgyProj: boolean;
    opforBrgyProj: boolean;
    opforPubEAttach: boolean;
    opforAllBrgyEAttach: boolean;
    opforBrgyEAttach: boolean;
}

interface EditPostFormProps {
    postId: number;
    onClose: () => void;
    onUpdated: () => void;
}

const EditPostForm: React.FC<EditPostFormProps> = ({ postId, onClose, onUpdated }) => {
    const { register, handleSubmit, setValue, formState: { errors } } = useForm<IFormInput>();
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Attachments state
    const [existingPublicAttachments, setExistingPublicAttachments] = useState<Attachment[]>([]);
    const [existingSecureAttachments, setExistingSecureAttachments] = useState<Attachment[]>([]);
    const [newPublicFiles, setNewPublicFiles] = useState<File[]>([]);
    const [newSecureFiles, setNewSecureFiles] = useState<File[]>([]);

    // Preview Modal State
    const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

    // Tagged projects state
    const [userProjects, setUserProjects] = useState<Project[]>([]);
    const [taggedProjects, setTaggedProjects] = useState<number[]>([]);
    const [initialTaggedProjects, setInitialTaggedProjects] = useState<number[]>([]); // For default logic
    const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
    const tagDropdownRef = useRef<HTMLDivElement>(null);

    // View options state
    const [isViewOptionsModalOpen, setIsViewOptionsModalOpen] = useState(false);
    const [viewOptions, setViewOptions] = useState<ViewOptions>({
        opforPubProj: false,
        opforAllBrgyProj: false,
        opforBrgyProj: false,
        opforPubEAttach: false,
        opforAllBrgyEAttach: false,
        opforBrgyEAttach: false,
    });
    const [isOldPost, setIsOldPost] = useState(false); // For default logic

    useEffect(() => {
        const fetchPostDetails = async () => {
            try {
                const [detailsRes, projectsRes] = await Promise.all([
                    api.get(`/api/manage-post/details/${postId}`),
                    api.get('/api/tagged-projects/for-tagging')
                ]);

                if (detailsRes.data.success) {
                    const { title, description, taggedProjects, attachments, viewOptions: fetchedViewOptions } = detailsRes.data.details;
                    setValue('title', title);
                    setValue('description', description);
                    setTaggedProjects(taggedProjects || []);
                    setInitialTaggedProjects(taggedProjects || []); // Set initial state for comparison

                    if (attachments && attachments.length > 0) {
                        const attachmentsWithUrls = await Promise.all(
                            attachments.map(async (att: Attachment) => {
                                try {
                                    const urlRes = await api.get(`/api/manage-post/attachment-url/${att.filePath}`,
                                     {
                                        params: { 
                                            fileType: att.fileType, 
                                            isPublic: att.isPublic, 
                                            source: 'post' 
                                        }
                                    });
                                    return { ...att, sasUrl: urlRes.data.url };
                                } catch (error) {
                                    console.error(`Failed to get SAS URL for ${att.filePath}`, error);
                                    return { ...att, sasUrl: '' }; // Handle error case
                                }
                            })
                        );
                        setExistingPublicAttachments(attachmentsWithUrls.filter((a: Attachment) => a.isPublic));
                        setExistingSecureAttachments(attachmentsWithUrls.filter((a: Attachment) => !a.isPublic));
                    }

                    if (fetchedViewOptions) {
                        setViewOptions(fetchedViewOptions);
                        setIsOldPost(false);
                    } else {
                        setIsOldPost(true);
                    }
                }

                if (projectsRes.data.success) {
                    setUserProjects(projectsRes.data.projects);
                }

            } catch (err) {
                toast.error('Failed to fetch post details.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchPostDetails();
    }, [postId, setValue]);

    // Effect for auto-selecting 'Barangay Only' for new secure attachments on old posts
    useEffect(() => {
        if (isOldPost && newSecureFiles.length > 0) {
            setViewOptions(prev => ({
                ...prev,
                opforBrgyEAttach: true,
                opforAllBrgyEAttach: false,
                opforPubEAttach: false
            }));
        }
    }, [newSecureFiles.length, isOldPost]);

    // Effect for auto-selecting 'Barangay Only' for new tagged projects on old posts
    useEffect(() => {
        const hasNewTaggedProjects = taggedProjects.length > initialTaggedProjects.length;
        if (isOldPost && hasNewTaggedProjects) {
            setViewOptions(prev => ({
                ...prev,
                opforBrgyProj: true,
                opforAllBrgyProj: false,
                opforPubProj: false
            }));
        }
    }, [taggedProjects.length, initialTaggedProjects.length, isOldPost]);

    const onSubmit = async (data: IFormInput) => {
        setIsSubmitting(true);
        const formData = new FormData();

        formData.append('title', data.title);
        formData.append('description', data.description);
        formData.append('taggedProjects', JSON.stringify(taggedProjects));
        formData.append('viewOptions', JSON.stringify(viewOptions));
        
        const attachmentsToKeep = [...existingPublicAttachments, ...existingSecureAttachments].map(a => a.attachmentID);
        formData.append('attachmentsToKeep', JSON.stringify(attachmentsToKeep));

        newPublicFiles.forEach(file => formData.append('new_attachments', file));
        newSecureFiles.forEach(file => formData.append('new_secure_attachments', file));

        try {
            const response = await api.put(`/api/manage-post/edit/${postId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (response.data.success) {
                toast.success('Post updated successfully!');
                onUpdated();
                onClose();
            } else {
                toast.error(response.data.message || 'Failed to update post.');
            }
        } catch (err) {
            toast.error('An error occurred while updating the post.');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveExistingAttachment = (id: number, isPublic: boolean) => {
        if (isPublic) {
            setExistingPublicAttachments(prev => prev.filter(a => a.attachmentID !== id));
        } else {
            setExistingSecureAttachments(prev => prev.filter(a => a.attachmentID !== id));
        }
    };

    const handlePreview = (attachment: Attachment) => {
        if (attachment.fileType.includes('word')) {
            if(attachment.sasUrl) window.open(attachment.sasUrl, '_blank');
        } else {
            setPreviewAttachment(attachment);
        }
    };

    if (loading) {
        return <Loading />;
    }

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit)} className="edit-post-form">
                <h4>Edit Post</h4>
                
                <div className="form-group">
                    <label htmlFor="title">Title</label>
                    <input type="text" id="title" {...register('title', { required: 'Title is required' })} />
                    {errors.title && <p className="error-message">{errors.title.message}</p>}
                </div>

                <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <textarea id="description" {...register('description', { required: 'Description is required' })} />
                    {errors.description && <p className="error-message">{errors.description.message}</p>}
                </div>

                <div className="form-group" ref={tagDropdownRef}>
                    <label>Tag Related Projects</label>
                    <div className="custom-multiselect">
                        <button type="button" onClick={() => setIsTagDropdownOpen(prev => !prev)} className="multiselect-button">
                            {taggedProjects.length > 0 ? `${taggedProjects.length} project(s) selected` : "Select Projects to Tag"}
                        </button>
                        {isTagDropdownOpen && (
                            <div className="dropdown-list">
                                {userProjects.map(p => (
                                    <div key={p.projectID} className="checkbox-item" onClick={() => setTaggedProjects(prev => prev.includes(p.projectID) ? prev.filter(id => id !== p.projectID) : [...prev, p.projectID])}>
                                        <input type="checkbox" id={`proj-${p.projectID}`} checked={taggedProjects.includes(p.projectID)} readOnly />
                                        <label htmlFor={`proj-${p.projectID}`}>{p.reference_number} - {p.title}</label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="form-group">
                    <a href="#" onClick={(e) => { e.preventDefault(); setIsViewOptionsModalOpen(true); }} className="view-options-link">
                        Privacy and View Options
                    </a>
                </div>

                <div className="attachment-management-section">
                    <h5>Public Attachments</h5>
                    <div className="existing-attachments-grid">
                        {existingPublicAttachments.map(att => (
                            <AttachmentItem 
                                key={att.attachmentID} 
                                attachment={att} 
                                onRemove={handleRemoveExistingAttachment}
                                onPreview={handlePreview}
                            />
                        ))}
                    </div>
                    <input type="file" multiple onChange={(e) => setNewPublicFiles(Array.from(e.target.files || []))} />
                </div>

                <div className="attachment-management-section">
                    <h5>Secure Attachments</h5>
                    <div className="existing-attachments-grid">
                        {existingSecureAttachments.map(att => (
                            <AttachmentItem 
                                key={att.attachmentID} 
                                attachment={att} 
                                onRemove={handleRemoveExistingAttachment}
                                onPreview={handlePreview}
                            />
                        ))}
                    </div>
                    <input type="file" multiple onChange={(e) => setNewSecureFiles(Array.from(e.target.files || []))} />
                </div>

                <div className="form-actions">
                    <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Updating...' : 'Save Changes'}
                    </button>
                </div>
            </form>

            <ViewOptionModal 
                isOpen={isViewOptionsModalOpen} 
                onClose={() => setIsViewOptionsModalOpen(false)} 
                options={viewOptions} 
                onSave={setViewOptions} 
            />

            <AttachmentPreviewModal 
                attachment={previewAttachment} 
                onClose={() => setPreviewAttachment(null)} 
            />
        </>
    );
};

export default EditPostForm;
