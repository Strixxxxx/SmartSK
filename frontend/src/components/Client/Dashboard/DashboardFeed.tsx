import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import PostCard, { Post } from '../../Portfolio/PostCard';
import PostModal from '../../Portfolio/PostModal';
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

    return (
        <div className="dashboard-feed">
            {loading && <div>Loading...</div>}
            {error && <div>{error}</div>}
            <div className="project-list">
                {posts.map(post => (
                    <PostCard key={post.postID} post={post} onPostClick={openModal} />
                ))}
            </div>
            <PostModal post={selectedPost} show={isModalOpen} onClose={closeModal} />
        </div>
    );
};

export default DashboardFeed;
