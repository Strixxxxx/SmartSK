import React, { useState, useEffect } from 'react';
import api from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import './ArchivedPostList.css';
import ContentViewer from '../../Portfolio/ContentViewer';
import { Post } from '../../../types/PostTypes';
import Loading from '../../Loading/Loading';

interface ArchivedPost {
    postID: number;
    title: string;
    archivedAt: string;
    publicAttachmentsCount: number;
    secureAttachmentsCount: number;
    taggedProjects: string;
}

const ArchivedPostList: React.FC = () => {
    const [posts, setPosts] = useState<ArchivedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchArchivedPosts = async () => {
        try {
            setLoading(true);
            const response = await api.get('/api/manage-post/archived');
            if (response.data.success) {
                setPosts(response.data.posts);
            } else {
                setError('Failed to fetch archived posts.');
            }
        } catch (err) {
            setError('An error occurred while fetching archived posts.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchArchivedPosts();
    }, []);

    const handleRestore = async (postId: number) => {
        try {
            const response = await api.put(`/api/manage-post/restore/${postId}`);
            if (response.data.success) {
                toast.success('Post restored successfully!');
                fetchArchivedPosts(); // Refresh the list
            } else {
                toast.error(response.data.message || 'Failed to restore post.');
            }
        } catch (err) {
            toast.error('An error occurred while restoring the post.');
            console.error(err);
        }
    };

    const handleView = async (postId: number) => {
        try {
            const response = await api.get(`/api/tagged-projects/post/${postId}`);
            if (response.data.success) {
                setSelectedPost(response.data.post);
                setIsModalOpen(true);
            } else {
                toast.error('Failed to fetch post details.');
            }
        } catch (err) {
            toast.error('An error occurred while fetching post details.');
            console.error(err);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedPost(null);
    };

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return <div className="error-message">{error}</div>;
    }

    return (
        <>
            <div className="archived-post-list">
                <h3>Archived Posts</h3>
                <div className="list-container">
                    {posts.length > 0 ? (
                        posts.map(post => (
                            <div key={post.postID} className="archived-item">
                                <div className="item-details">
                                    <span className="post-title">{post.title}</span>
                                    <span className="post-info">Archived: {new Date(post.archivedAt).toLocaleDateString()}</span>
                                    <span className="post-info">Public Files: {post.publicAttachmentsCount}</span>
                                    <span className="post-info">Secure Files: {post.secureAttachmentsCount}</span>
                                </div>
                                <div className="item-actions">
                                    <button onClick={() => handleView(post.postID)} className="view-btn">View</button>
                                    <button onClick={() => handleRestore(post.postID)} className="restore-btn">Restore</button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p>No archived posts found.</p>
                    )}
                </div>
            </div>
            <ContentViewer 
                post={selectedPost} 
                show={isModalOpen} 
                onClose={closeModal} 
                onPostChange={() => {}} 
                isAuthenticated={true} 
            />
        </>
    );
};

export default ArchivedPostList;
