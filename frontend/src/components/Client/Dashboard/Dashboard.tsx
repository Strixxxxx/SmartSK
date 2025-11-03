import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../backend connection/axiosConfig';
import CreatePostModal from './CreatePostModal';
import ManagePostModal from '../ManagePost/ManagePostModal';
import DashboardFeed from './DashboardFeed';
import FilterListIcon from '@mui/icons-material/FilterList';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [refreshFeed, setRefreshFeed] = useState(false);

    // State for search and filter
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<string | null>(null);
    const [barangays, setBarangays] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user) {
            navigate('/home', { replace: true });
        }

        // Fetch barangays for the filter dropdown
        const fetchBarangays = async () => {
            try {
                const response = await axios.get('/api/posts/barangays');
                setBarangays(response.data);
            } catch (err) {
                console.error('Failed to fetch barangays:', err);
            }
        };

        fetchBarangays();

        // Close dropdown when clicking outside
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };

    }, [user, navigate]);

    const handlePostCreated = () => {
        setRefreshFeed(prev => !prev);
    };

    const handleFilterSelect = (selectedFilter: string | null) => {
        setFilter(selectedFilter);
        setIsFilterOpen(false);
    };
    
    const getFilterDisplayName = () => {
        if (filter === null) return 'All Posts';
        return filter;
    }

    return (
        <div className="dashboard-content">
            <div className="dashboard-header">
                <h2>Welcome to Smart SK Dashboard</h2>
                <div className="dashboard-header-buttons">
                    <button onClick={() => setIsManageModalOpen(true)} className="manage-post-btn">View Archived Posts</button>
                    <button onClick={() => setIsCreateModalOpen(true)} className="create-post-btn">Create Post</button>
                </div>
            </div>

            {isCreateModalOpen && (
                <CreatePostModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onPostCreated={handlePostCreated}
                />
            )}

            {isManageModalOpen && (
                <ManagePostModal
                    onClose={() => setIsManageModalOpen(false)}
                />
            )}

            <div className="dashboard-main-content">
                <div className="feed-controls">
                    <input
                        type="text"
                        placeholder="Search by title or author..."
                        className="feed-search-bar"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <div className="filter-menu" ref={filterRef}>
                        <button onClick={() => setIsFilterOpen(prev => !prev)} className="filter-button">
                            <FilterListIcon />
                            <span>{getFilterDisplayName()}</span>
                        </button>
                        {isFilterOpen && (
                            <div className="filter-dropdown">
                                <button onClick={() => handleFilterSelect(null)}>All Posts</button>
                                <button onClick={() => handleFilterSelect('My Posts')}>My Posts</button>
                                <div className="filter-divider" />
                                {barangays.map(b => (
                                    <button key={b} onClick={() => handleFilterSelect(b)}>{b}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <DashboardFeed refreshFeed={refreshFeed} searchQuery={searchQuery} filter={filter} />
            </div>
        </div>
    );
};

export default Dashboard;