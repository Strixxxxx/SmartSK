import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import AccArchive from './accArchive';
import ProjArchive from './projArchive';
import './Archive.css';

type ArchiveTab = 'accounts' | 'projects';

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const Archive: React.FC = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [activeTab, setActiveTab] = useState<ArchiveTab>('accounts');

  return (
    <div className={`archive-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <header className="archive-header">
        <h1>Archive Management</h1>
        <p>View and restore archived user accounts and projects.</p>
      </header>

      <div className="archive-tabs">
        <button 
          className={`archive-tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          Archived Accounts
        </button>
        <button 
          className={`archive-tab ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          Archived Projects
        </button>
      </div>

      <main className="archive-content">
        {activeTab === 'accounts' && <AccArchive />}
        {activeTab === 'projects' && <ProjArchive />}
      </main>
    </div>
  );
};

export default Archive;
