import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import ProjList from './ProjList';
import ProjARC from './ProjARC';
import './AdminProj.css';

type ProjectTab = 'list' | 'archive';

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const AdminProj: React.FC = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [activeTab, setActiveTab] = useState<ProjectTab>('list');

  return (
    <div className={`projects-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="projects-content-wrapper">
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Project Management</h1>
            <p className="page-subtitle">Review and manage project submissions within your barangay.</p>
          </div>
        </div>

        <div className="projects-tabs">
          <button
            className={`projects-tab ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            Project List
          </button>
          <button
            className={`projects-tab ${activeTab === 'archive' ? 'active' : ''}`}
            onClick={() => setActiveTab('archive')}
          >
            Archived Projects
          </button>
        </div>

        <main className="projects-tab-content">
          {activeTab === 'list' && <ProjList />}
          {activeTab === 'archive' && <ProjARC />}
        </main>
      </div>
    </div>
  );
};

export default AdminProj;