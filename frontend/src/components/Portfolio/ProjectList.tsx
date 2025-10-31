import React, { useState, useEffect } from 'react';
import axios from '../../backend connection/axiosConfig';
import PostCard from './PostCard';
import { Post } from '../../types/PostTypes';
import Login from '../Login/Login';
import ContentViewer from './ContentViewer'; // Import the modal component
import './ProjectList.css';

const ProjectList: React.FC = () => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [barangays, setBarangays] = useState<string[]>([]);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);

    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const createParticles = () => {
            const particles = document.getElementById('particles');
            if (particles) {
                particles.innerHTML = ''; // Clear existing particles
                const particleCount = 50;
                for (let i = 0; i < particleCount; i++) {
                    const particle = document.createElement('div');
                    particle.className = 'particle';
                    particle.style.left = Math.random() * 100 + '%';
                    particle.style.animationDelay = Math.random() * 20 + 's';
                    particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
                    particles.appendChild(particle);
                }
            }
        };
        createParticles();

        const fetchBarangays = async () => {
            try {
                const response = await axios.get('/api/posts/barangays');
                setBarangays(response.data);
            } catch (err) {
                console.error('Failed to fetch barangays:', err);
            }
        };

        fetchBarangays();
    }, []);

    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                const url = activeFilter ? `/api/posts?barangay=${encodeURIComponent(activeFilter)}` : '/api/posts';
                const response = await axios.get(url);
                setPosts(response.data);
            } catch (err) {
                setError('Failed to fetch posts.');
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
    }, [activeFilter]);



    const handleFilterClick = (barangay: string) => {
        if (activeFilter === barangay) {
            setActiveFilter(null); // Toggle off if already active
        } else {
            setActiveFilter(barangay);
        }
    };

    const openModal = (post: Post) => {
        setSelectedPost(post);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedPost(null);
    };

    const handlePostChange = (postId: number) => {
        const post = posts.find(p => p.postID === postId);
        if (post) {
            setSelectedPost(post);
        }
    };

    return (
        <>
            <div className="portfolio">
                <div className="particles" id="particles"></div>
                <nav>
                    <ul>
                        <li><a href="/">Home</a></li>
                        <li><a href="/project-list">Projects</a></li>
                        <li><button onClick={() => setIsLoginModalOpen(true)}>Login</button></li>
                    </ul>
                </nav>

                <header id="home" className="project-list-header">
                    <div className="hero-content">
                        <h1>Project Posts</h1>
                        <p className="subtitle">Browse the latest projects from Sangguniang Kabataan.</p>
                    </div>
                </header>

                <div className="project-list-container">
                    <div className="filter-bar">
                        {barangays.map(barangay => (
                            <button 
                                key={barangay} 
                                onClick={() => handleFilterClick(barangay)}
                                className={`filter-btn ${activeFilter === barangay ? 'active' : ''}`}>
                                {barangay}
                            </button>
                        ))}
                    </div>
                    <div className="project-list">
                        {loading && <div>Loading...</div>}
                        {error && <div>{error}</div>}
                        {posts.map(post => (
                            <PostCard key={post.postID} post={post} onPostClick={openModal} />
                        ))}
                    </div>
                </div>

                <footer id="contact">
                    <div className="footer-content">
                        <p className="copyright">© 2025 Smart SK. Empowering youth governance through technology.</p>
                    </div>
                </footer>
            </div>
            <Login 
                open={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
            />
            <ContentViewer post={selectedPost} show={isModalOpen} onClose={closeModal} onPostChange={handlePostChange} />
        </>
    );
};

export default ProjectList;