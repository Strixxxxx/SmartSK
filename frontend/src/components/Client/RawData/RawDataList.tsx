import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import './RawDataList.css';
import api from '../../../backend connection/axiosConfig';

interface DataRow {
    ppa: string;
    category: string;
    committee: string;
    [key: string]: any; // For dynamic year-based columns
}

interface FilterOptions {
    committees: string[];
    categories: string[];
}

interface FlashMessage {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
}

interface RawDataListProps {}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const RawDataList: React.FC<RawDataListProps> = () => {
    const { sidebarCollapsed } = useOutletContext<OutletContextType>();
    const [data, setData] = useState<DataRow[]>([]);
    const [years, setYears] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        committees: [],
        categories: []
    });
    const [filters, setFilters] = useState({
        ppa: '',
        committee: '',
        category: ''
    });
    const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

    const showFlashMessage = (type: 'success' | 'error' | 'info' | 'warning', message: string, autoHide: boolean = true) => {
        setFlashMessage({ type, message });
        if (autoHide) {
            setTimeout(() => {
                setFlashMessage(null);
            }, 8000);
        }
    };

    const hideFlashMessage = () => {
        setFlashMessage(null);
    };

    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await api.get('/api/rawdata/options');
            setFilterOptions(response.data);
        } catch (error) {
            if (import.meta.env.DEV) console.error('Error fetching filter options:', (error as Error).message);
        }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        try {
            const response = await api.get('/api/rawdata', { params: filters });
            setData(response.data.data || []);
            setYears(response.data.years || []);
        } catch (error: any) {
            setError(`Failed to fetch data: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchFilterOptions();
    }, [fetchFilterOptions]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatYearData = (row: DataRow, type: 'target' | 'budget') => {
        if (years.length === 0) return 'No data';
        
        return years
            .map(year => {
                const value = row[`${year}_${type}`];
                let displayValue;
                
                if (value === null || value === undefined || value === '') {
                    displayValue = 'None';
                } else if (type === 'budget' && !isNaN(Number(value))) {
                    displayValue = Number(value).toLocaleString();
                } else {
                    displayValue = value;
                }
                
                return `${year}: ${displayValue}`;
            })
            .join(' | ');
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleClearFilters = () => {
        setFilters({
            ppa: '',
            committee: '',
            category: ''
        });
    };

    const handleDownload = async (format: 'excel' | 'csv') => {
        try {
            showFlashMessage('info', `Preparing ${format.toUpperCase()} download...`);
            
            const response = await api.get('/api/rawdata/download', {
                params: { format },
                responseType: 'blob'
            });

            const blob = new Blob([response.data], {
                type: format === 'csv' ? 'text/csv' : 'application/vnd.ms-excel'
            });
            
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `raw_data_export.${format === 'excel' ? 'xls' : 'csv'}`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            hideFlashMessage();
            showFlashMessage('success', `${format.toUpperCase()} file has been downloaded successfully.`);
        } catch (error: any) {
            if (import.meta.env.DEV) console.error(`Error downloading ${format}:`, error);
            const errorMessage = error.response?.data?.message || error.message || `Failed to download ${format} file.`;
            showFlashMessage('error', `Download failed: ${errorMessage}`);
        }
    };

    if (loading && data.length === 0) {
        return (
            <div className={`rawdata-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
                <div className="loading">
                    <div className="loading-spinner"></div>
                    <p>Loading raw data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`rawdata-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
            <div className="rawdata-content">
                <div className="rawdata-header">
                    <h1 className="rawdata-title">Raw Data Projects</h1>
                    <div className="rawdata-subtitle">
                        View and analyze project data efficiently
                    </div>
                </div>

                <div className="rawdata-summary-grid">
                    <div className="summary-card">
                        <div className="card-icon">📊</div>
                        <div className="card-content">
                            <h3>Total Records</h3>
                            <div className="card-stats">
                                <span className="stat-number">{data.length}</span>
                                <span className="stat-label">Data Entries</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="summary-card">
                        <div className="card-icon">📅</div>
                        <div className="card-content">
                            <h3>Year Range</h3>
                            <div className="card-stats">
                                <span className="stat-number">
                                    {years.length > 0 ? `${Math.min(...years)} - ${Math.max(...years)}` : 'N/A'}
                                </span>
                                <span className="stat-label">Active Years</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="summary-card">
                        <div className="card-icon">🏷️</div>
                        <div className="card-content">
                            <h3>Categories</h3>
                            <div className="card-stats">
                                <span className="stat-number">{filterOptions.categories.length}</span>
                                <span className="stat-label">Available Categories</span>
                            </div>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="card-icon">🏛️</div>
                        <div className="card-content">
                            <h3>Committees</h3>
                            <div className="card-stats">
                                <span className="stat-number">{filterOptions.committees.length}</span>
                                <span className="stat-label">Active Committees</span>
                            </div>
                        </div>
                    </div>
                </div>

                {flashMessage && (
                    <div className={`flash-message flash-${flashMessage.type}`}>
                        <div className="flash-content">
                            <span className="flash-text">{flashMessage.message}</span>
                            <button 
                                className="flash-close" 
                                onClick={hideFlashMessage}
                                type="button"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="error-message">
                        <strong>Notice:</strong> {error}
                    </div>
                )}

                <div className="rawdata-main-content">
                    <div className="controls-card">
                        <div className="controls-header">
                            <h3>🔍 Data Controls</h3>
                            <p>Filter and manage your data</p>
                        </div>
                        
                        <div className="controls-container">
                            <div className="filters">
                                <input
                                    type="text"
                                    name="ppa"
                                    placeholder="🔍 Search by PPA..."
                                    value={filters.ppa}
                                    onChange={handleFilterChange}
                                    className="search-bar"
                                />
                                <select 
                                    name="committee" 
                                    value={filters.committee} 
                                    onChange={handleFilterChange} 
                                    className="combo-box"
                                >
                                    <option value="">All Committees</option>
                                    {filterOptions.committees.map(committee => (
                                        <option key={committee} value={committee}>{committee}</option>
                                    ))}
                                </select>
                                <select 
                                    name="category" 
                                    value={filters.category} 
                                    onChange={handleFilterChange} 
                                    className="combo-box"
                                >
                                    <option value="">All Categories</option>
                                    {filterOptions.categories.map(category => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={handleClearFilters} 
                                    className="clear-filters-btn"
                                >
                                    🗑️ Clear Filters
                                </button>
                            </div>
                            
                            <div className="actions">
                                <button 
                                    className={`action-button download-btn`}
                                    onClick={() => handleDownload('csv')}
                                >
                                    📥 Download CSV
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="table-card">
                        <div className="table-header">
                            <h3>📋 Project Data Overview</h3>
                            <p>Complete project information with yearly breakdowns</p>
                        </div>
                        
                        <div className="table-container">
                            {loading ? (
                                <div className="loading-container">
                                    <div className="loading-spinner"></div>
                                    <p>Loading data...</p>
                                </div>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="compact-table">
                                        <thead>
                                            <tr>
                                                <th className="ppa-header">📋 Project/Program/Activity</th>
                                                <th className="category-header">🏷️ Category</th>
                                                <th className="committee-header">🏛️ Committee</th>
                                                <th className="target-header">🎯 Target</th>
                                                <th className="budget-header">💰 Budget</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="no-data-cell">
                                                        <div className="no-data-message">
                                                            <p>No data available</p>
                                                            <small>Try adjusting your filters or upload new data</small>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                data.map((row, index) => (
                                                    <tr key={`row-${index}`} className="data-row">
                                                        <td className="ppa-cell">
                                                            <div className="cell-content">
                                                                {row.ppa || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="category-cell">
                                                            <div className="cell-content">
                                                                <span className="category-badge">
                                                                    {row.category || 'N/A'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="committee-cell">
                                                            <div className="cell-content">
                                                                {row.committee || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="target-cell">
                                                            <div className="year-data target-data">
                                                                {formatYearData(row, 'target')}
                                                            </div>
                                                        </td>
                                                        <td className="budget-cell">
                                                            <div className="year-data budget-data">
                                                                {formatYearData(row, 'budget')}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RawDataList;
