import React, { useState, useEffect } from 'react';
import api from '../../../backend connection/axiosConfig';
import Loading from '../../Loading/Loading';
import './ActivePostSelector.css';

interface Post {
    postID: number;
    title: string;
    postReference: string;
    createdAt: string;
}

interface ActivePostSelectorProps {
    onPostSelect: (post: Post) => void;
    onBack: () => void;
}

const ActivePostSelector: React.FC<ActivePostSelectorProps> = ({ onPostSelect, onBack }) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPostId, setSelectedPostId] = useState<number | null>(null);

    useEffect(() => {
        const fetchActivePosts = async () => {
            try {
                setLoading(true);
                const response = await api.get('/api/manage-post/active');
                if (response.data.success) {
                    setPosts(response.data.posts);
                } else {
                    setError('Failed to fetch posts.');
                }
            } catch (err) {
                setError('An error occurred while fetching posts.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchActivePosts();
    }, []);

    const handleNext = () => {
        const selectedPost = posts.find(p => p.postID === selectedPostId);
        if (selectedPost) {
            onPostSelect(selectedPost);
        }
    };

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return <div className="error-message">{error}</div>;
    }

    return (
        <div className="active-post-selector">
            <h3>Select an Active Post</h3>
            <div className="post-list">
                {posts.length > 0 ? (
                    posts.map(post => (
                        <div key={post.postID} className="post-item">
                            <input 
                                type="radio" 
                                name="active-post" 
                                id={`post-${post.postID}`} 
                                value={post.postID}
                                checked={selectedPostId === post.postID}
                                onChange={() => setSelectedPostId(post.postID)}
                            />
                            <label htmlFor={`post-${post.postID}`}>
                                <span className="post-title">{post.title}</span>
                                <span className="post-ref">{post.postReference}</span>
                                <span className="post-date">{new Date(post.createdAt).toLocaleDateString()}</span>
                            </label>
                        </div>
                    ))
                ) : (
                    <p>No active posts found.</p>
                )}
            </div>
            <div className="selector-actions">
                <button onClick={onBack} className="back-btn">Back</button>
                <button onClick={handleNext} disabled={!selectedPostId} className="next-btn">
                    Next
                </button>
            </div>
        </div>
    );
};

export default ActivePostSelector;
