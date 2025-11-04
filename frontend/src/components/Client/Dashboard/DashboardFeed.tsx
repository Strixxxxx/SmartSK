import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import PostCard from '../../Portfolio/PostCard';
import { Post } from '../../../types/PostTypes';
import ContentViewer from '../../Portfolio/ContentViewer';
import CommentModal from '../../Portfolio/CommentModal'; // Import CommentModal
import { useWebSocket } from '../../../context/WebSocketContext';
import Loading from '../../Loading/Loading';
import './DashboardFeed.css';

import PostManagerModal from '../ManagePost/PostManagerModal';

interface DashboardFeedProps {
    refreshFeed: boolean;
    searchQuery: string;
    filter: string | null;
}

const DashboardFeed: React.FC<DashboardFeedProps> = ({ refreshFeed, searchQuery, filter }) => {
    const { postUpdateTimestamp } = useWebSocket();
    const [posts, setPosts] = useState<Post[]>([]);
    const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [managePost, setManagePost] = useState<Post | null>(null);
    const [commentModalPostId, setCommentModalPostId] = useState<number | null>(null); // State for CommentModal

    // Fetch posts from the API based on the filter
    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/posts/feed', {
                    params: { filter },
                });
                setPosts(response.data);
            } catch (err) {
                setError('Failed to fetch posts.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
    }, [refreshFeed, postUpdateTimestamp, filter]);

    // Filter posts locally based on the search query
    useEffect(() => {
        if (!searchQuery) {
            setFilteredPosts(posts);
            return;
        }
        const lowercasedQuery = searchQuery.toLowerCase();
        const result = posts.filter(post =>
            post.title.toLowerCase().includes(lowercasedQuery) ||
            post.author.toLowerCase().includes(lowercasedQuery)
        );
        setFilteredPosts(result);
    }, [searchQuery, posts]);

    const openViewer = (post: Post) => {
        setSelectedPost(post);
        setIsViewerOpen(true);
    };

    const closeViewer = () => {
        setIsViewerOpen(false);
        setSelectedPost(null);
    };

    const openComments = (postId: number) => {
        setCommentModalPostId(postId);
    };

    const closeComments = () => {
        setCommentModalPostId(null);
    };

    const handleCommentPosted = (postId: number) => {
        const updateCount = (p: Post) => p.postID === postId ? { ...p, commentCount: p.commentCount + 1 } : p;
        setPosts(prevPosts => prevPosts.map(updateCount));
        if (selectedPost && selectedPost.postID === postId) {
            setSelectedPost(prev => prev ? updateCount(prev) : null);
        }
    };

    const handleOpenManagePost = (post: Post) => {
        setManagePost(post); // Set the data for the manager modal
        closeViewer();       // Close the content viewer modal
    };

    const handleCloseManagePost = () => {
        setManagePost(null);
        closeViewer(); // Close both modals
        // Trigger feed refresh by re-fetching posts
        fetchPostsManually();
    };

    const handleBackToList = () => {
        setManagePost(null);
    };

    const fetchPostsManually = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/posts/feed', {
                params: { filter },
            });
            setPosts(response.data);
        } catch (err) {
            setError('Failed to fetch posts.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handlePostChange = async (postId: number) => {
        const numericPostId = typeof postId === 'string' ? parseInt(postId, 10) : postId;
        if (isNaN(numericPostId)) {
            setError('Invalid post ID');
            return;
        }

        const existingPost = posts.find(p => p.postID === numericPostId);
        if (existingPost) {
            setSelectedPost(existingPost);
            return;
        }

        try {
            setLoading(true);
            const response = await axios.get(`/api/tagged-projects/post/${numericPostId}`);
            if (response.data.success) {
                const newPost = response.data.post;
                setPosts(prev => [newPost, ...prev]);
                setSelectedPost(newPost);
            } else {
                setError('Post not found');
            }
        } catch (err) {
            setError('An error occurred while fetching the post.');
        }
        finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard-feed">
            {loading && <Loading />}
            {error && <div>{error}</div>}
            <div className="project-list">
                {filteredPosts.map(post => (
                    <PostCard key={post.postID} post={post} onPostClick={openViewer} onCommentClick={openComments} />
                ))}
            </div>
            <ContentViewer 
                post={selectedPost} 
                show={isViewerOpen} 
                onClose={closeViewer} 
                onPostChange={handlePostChange} 
                isAuthenticated={true} 
                onOpenManagePost={handleOpenManagePost}
                onCommentClick={openComments} // Pass the handler here
            />
            <CommentModal 
                postID={commentModalPostId}
                show={commentModalPostId !== null}
                onClose={closeComments}
                onCommentPosted={handleCommentPosted}
                isAuthenticated={true} // Specify authenticated state
            />
            {managePost && (
                <PostManagerModal
                    postId={managePost.postID}
                    postReference={managePost.postReference}
                    onClose={handleCloseManagePost}
                    onBackToList={handleBackToList}
                />
            )}
        </div>
    );
};

export default DashboardFeed;