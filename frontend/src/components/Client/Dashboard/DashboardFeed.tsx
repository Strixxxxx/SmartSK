import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import PostCard from '../../Portfolio/PostCard';
import './DashboardFeed.css';

interface Attachment {
    attachmentID: number;
    fileType: string;
    filePath: string;
}

interface Post {
    postID: number;
    title: string;
    description: string;
    author: string;
    attachments: Attachment[];
}

interface DashboardFeedProps {
    refreshFeed: boolean;
}

const DashboardFeed: React.FC<DashboardFeedProps> = ({ refreshFeed }) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/posts');
                setPosts(response.data);
            } catch (err) {
                setError('Failed to fetch posts.');
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
    }, [refreshFeed]);

    return (
        <div className="dashboard-feed">
            {loading && <div>Loading...</div>}
            {error && <div>{error}</div>}
            <div className="project-list">
                {posts.map(post => (
                    <PostCard key={post.postID} post={post} />
                ))}
            </div>
        </div>
    );
};

export default DashboardFeed;
