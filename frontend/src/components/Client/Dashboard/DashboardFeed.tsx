import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import PostCard from '../../Portfolio/PostCard';
import { Post } from '../../../types/PostTypes';
import ContentViewer from '../../Portfolio/ContentViewer';
import './DashboardFeed.css';

interface DashboardFeedProps {
    refreshFeed: boolean;
}

const DashboardFeed: React.FC<DashboardFeedProps> = ({ refreshFeed }) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/posts/feed');
                setPosts(response.data);
            } catch (err) {
                setError('Failed to fetch posts.');
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
    }, [refreshFeed]);

    const openModal = (post: Post) => {
        setSelectedPost(post);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedPost(null);
    };

    const handlePostChange = async (postId: number) => {
        // Ensure postId is a valid number
        const numericPostId = typeof postId === 'string' ? parseInt(postId, 10) : postId;
        
        if (isNaN(numericPostId)) {
            console.error('Invalid postId:', postId);
            setError('Invalid post ID');
            return;
        }

        // First check if the post already exists in the current posts array
        const existingPost = posts.find(p => p.postID === numericPostId);
        if (existingPost) {
            setSelectedPost(existingPost);
            return;
        }

        // If not found, fetch it from the API
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get(`/api/tagged-projects/post/${numericPostId}`);
            if (response.data.success) {
                const newPost = response.data.post;
                // Add the new post to the beginning of the posts array
                setPosts(prevPosts => [newPost, ...prevPosts]);
                setSelectedPost(newPost);
            } else {
                setError('Post not found');
            }
        } catch (err) {
            console.error('Error fetching post:', err);
            setError('An error occurred while fetching the post.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard-feed">
            {loading && <div>Loading...</div>}
            {error && <div>{error}</div>}
            <div className="project-list">
                {posts.map(post => (
                    <PostCard key={post.postID} post={post} onPostClick={openModal} />
                ))}
            </div>
            <ContentViewer 
                post={selectedPost} 
                show={isModalOpen} 
                onClose={closeModal} 
                onPostChange={handlePostChange} 
                isAuthenticated={true} 
            />
        </div>
    );
};

export default DashboardFeed;