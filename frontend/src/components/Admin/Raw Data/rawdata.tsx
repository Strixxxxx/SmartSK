import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import './rawdata.css';
import api from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';

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

interface UploadSummary {
    totalRows: number;
    processedRows: number;
    errorRows: number;
    totalInserts: number;
    yearsProcessed: number[];
    yearRange: string;
    uploadedBy: string;
    barangay: string;
    errors: string[];
}

interface RawDataProps {}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const RawData: React.FC<RawDataProps> = () => {
    const { sidebarCollapsed } = useOutletContext<OutletContextType>();
    const [data, setData] = useState<DataRow[]>([]);
    const [years, setYears] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({
        committees: [],
        categories: []
    });
    const [filters, setFilters] = useState({
        ppa: '',
        committee: '',
        category: ''
    });
    const [uploading, setUploading] = useState(false);

    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await api.get('/api/rawdata/options');
            setFilterOptions(response.data);
        } catch (error) {
            console.error('Error fetching filter options:', (error as Error).message);
        }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/api/rawdata', { params: filters });
            setData(response.data.data || []);
            setYears(response.data.years || []);
        } catch (error: any) {
            toast.error(`Failed to fetch data: ${error.message}`);
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

    const handleUpdate = async () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv';
        fileInput.style.display = 'none';
        
        fileInput.onchange = async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            
            if (!file) {
                toast.error('No file selected.');
                return;
            }

            if (!file.name.toLowerCase().endsWith('.csv')) {
                toast.error('Please select a CSV file.');
                return;
            }

            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                const shouldContinue = window.confirm(
                    `This file is ${(file.size / 1024 / 1024).toFixed(1)}MB. ` +
                    'Large files may take several minutes to process. Continue?'
                );
                if (!shouldContinue) {
                    document.body.removeChild(fileInput);
                    return;
                }
            }

            const formData = new FormData();
            formData.append('file', file);
            const toastId = toast.loading(`Processing ${file.name}... This may take several minutes.`);

            try {
                setUploading(true);
                
                const response = await api.post('/api/rawdata/upload', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    },
                    timeout: 600000,
                    onUploadProgress: (progressEvent) => {
                        if (progressEvent.total) {
                            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                            toast.update(toastId, { render: `Uploading: ${percentCompleted}%. Please wait...` });
                        }
                    }
                });
                
                const summary: UploadSummary = response.data.summary;
                let successMessage = `Update Complete! Processed ${summary.processedRows}/${summary.totalRows} rows.`;
                
                toast.update(toastId, { render: successMessage, type: 'success', isLoading: false, autoClose: 8000 });

                if (response.data.warning) {
                    setTimeout(() => {
                        toast.warning(response.data.warning, { autoClose: 8000 });
                    }, 2000);
                }
                
                setTimeout(async () => {
                    try {
                        await Promise.all([
                            fetchData(),
                            fetchFilterOptions()
                        ]);
                        toast.info('Data refreshed successfully!', { autoClose: 3000 });
                    } catch (refreshError) {
                        toast.warning('Upload completed but failed to refresh display. Please reload the page.', { autoClose: 8000 });
                    }
                }, 1000);
                
            } catch (error: any) {
                let errorMessage = 'Upload failed: ';
                if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                    errorMessage = 'Upload timed out. The file may still be processing. Please refresh in a few minutes.';
                    toast.update(toastId, { render: errorMessage, type: 'warning', isLoading: false, autoClose: 10000 });
                } else {
                    errorMessage += error.response?.data?.message || error.message || 'Unknown error occurred.';
                    toast.update(toastId, { render: errorMessage, type: 'error', isLoading: false, autoClose: 10000 });
                }
                
            } finally {
                setUploading(false);
                if (document.body.contains(fileInput)) {
                    document.body.removeChild(fileInput);
                }
            }
        };

        document.body.appendChild(fileInput);
        fileInput.click();
    };

    const handleDownload = async (format: 'csv') => {
        const toastId = toast.loading(`Preparing ${format.toUpperCase()} download...`);
        try {
            const response = await api.get('/api/rawdata/download', {
                params: { format },
                responseType: 'blob'
            });

            const blob = new Blob([response.data], {
                type: 'text/csv'
            });
            
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `raw_data_export.csv`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            toast.update(toastId, { render: `${format.toUpperCase()} file downloaded successfully.`, type: 'success', isLoading: false, autoClose: 5000 });
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || `Failed to download ${format} file.`;
            toast.update(toastId, { render: `Download failed: ${errorMessage}`, type: 'error', isLoading: false, autoClose: 5000 });
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
                    <h1 className="rawdata-title">Raw Data Management</h1>
                    <div className="rawdata-subtitle">
                        Manage and analyze your project data efficiently
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
                                    disabled={uploading}
                                />
                                <select 
                                    name="committee" 
                                    value={filters.committee} 
                                    onChange={handleFilterChange} 
                                    className="combo-box"
                                    disabled={uploading}
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
                                    disabled={uploading}
                                >
                                    <option value="">All Categories</option>
                                    {filterOptions.categories.map(category => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="actions">
                                <button 
                                    onClick={handleClearFilters} 
                                    className="action-button clear-filters-btn"
                                    disabled={uploading}
                                >
                                    🗑️ Clear Filters
                                </button>
                                <button 
                                    className={`action-button download-btn ${uploading ? 'disabled' : ''}`}
                                    disabled={uploading}
                                    onClick={() => handleDownload('csv')}
                                >
                                    📥 Download CSV
                                </button>
                                <button 
                                    onClick={handleUpdate} 
                                    className={`action-button update-button ${uploading ? 'uploading' : ''}`}
                                    disabled={uploading || loading}
                                >
                                    {uploading ? (
                                        <span className="button-content">
                                            <span className="spinner"></span>
                                            Updating...
                                        </span>
                                    ) : (
                                        <>📤 Update Data</>
                                    )}
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

export default RawData;
