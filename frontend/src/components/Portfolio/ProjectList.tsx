import React, { useState, useEffect } from 'react';
import axios from '../../backend connection/axiosConfig';
import PostCard from './PostCard';
import Portal from '../Portal/portal';
import Login from '../Login/Login';
import './ProjectList.css';

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

const ProjectList: React.FC = () => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPortalOpen, setIsPortalOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [selectedBarangay, setSelectedBarangay] = useState('');

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

        const fetchPosts = async () => {
            try {
                const response = await axios.get('/api/posts');
                setPosts(response.data);
            } catch (err) {
                setError('Failed to fetch posts.');
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
    }, []);

    const handleBarangaySelect = (barangay: string) => {
        setSelectedBarangay(barangay);
        setIsPortalOpen(false);
        setIsLoginModalOpen(true);
    };

    return (
        <>
            <div className="portfolio">
                <div className="particles" id="particles"></div>
                <nav>
                    <ul>
                        <li><a href="/">Home</a></li>
                        <li><a href="/project-list">Projects</a></li>
                        <li><button onClick={() => setIsPortalOpen(true)}>Login</button></li>
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
                        <input type="text" placeholder="Filter by Barangay (coming soon)" disabled />
                    </div>
                    <div className="project-list">
                        {loading && <div>Loading...</div>}
                        {error && <div>{error}</div>}
                        {posts.map(post => (
                            <PostCard key={post.postID} post={post} />
                        ))}
                    </div>
                </div>

                <footer id="contact">
                    <div className="footer-content">
                        <p className="copyright">© 2025 Smart SK. Empowering youth governance through technology.</p>
                    </div>
                </footer>
            </div>
            <Portal 
                isOpen={isPortalOpen} 
                onClose={() => setIsPortalOpen(false)} 
                onBarangaySelect={handleBarangaySelect} 
            />
            <Login 
                open={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
                barangay={selectedBarangay}
            />
        </>
    );
};

export default ProjectList;