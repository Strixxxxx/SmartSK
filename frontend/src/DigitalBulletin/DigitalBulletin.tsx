import React, { useState, useEffect } from 'react';
import axios from '../backend connection/axiosConfig';
import DisclosureCard from './DisclosureCard';
import styles from './DigitalBulletin.module.css';
import Loading from '../components/Loading/Loading';
import Login from '../components/Login/Login';
import { useNavigate } from 'react-router-dom';

interface ProjectBatch {
    batchID: number;
    barangayID: number;
    projType: 'ABYIP' | 'CBYDP';
    projName: string;
    targetYear: string;
    budget: number;
    createdAt: string;
    barangayName: string;
    StatusID: number;
    StatusName: string;
    isCurrent: number;
    termID: number;
}

const DigitalBulletin: React.FC = () => {
    const navigate = useNavigate();
    const [disclosures, setDisclosures] = useState<ProjectBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    const [activeBarangays, setActiveBarangays] = useState<string[]>([]);
    const [activeTypes, setActiveTypes] = useState<string[]>([]);
    const [activeStatus, setActiveStatus] = useState<number[]>([]);

    const availableBarangays = ['San Bartolome', 'Nagkaisang Nayon'];

    useEffect(() => {
        const fetchDisclosures = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/disclosures');
                if (response.data.success) {
                    setDisclosures(response.data.data);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to fetch disclosures.');
            } finally {
                setLoading(false);
            }
        };
        fetchDisclosures();
    }, []);

    const filterProjects = (projects: ProjectBatch[]) => {
        return projects.filter(p => {
            const bMatch = activeBarangays.length === 0 || activeBarangays.includes(p.barangayName);
            const tMatch = activeTypes.length === 0 || activeTypes.includes(p.projType);
            const sMatch = activeStatus.length === 0 || activeStatus.includes(p.isCurrent);
            return bMatch && tMatch && sMatch;
        });
    };

    const getDisplayName = (p: ProjectBatch) => {
        return `${p.projType} ${p.targetYear} of ${p.barangayName}`;
    };

    const groupedData = filterProjects(disclosures).reduce((acc: any, p) => {
        const termKey = `term-${p.termID}`;
        if (!acc[termKey]) {
            acc[termKey] = {
                termID: p.termID,
                isCurrent: p.isCurrent,
                label: p.isCurrent ? 'Active Administration' : `Past Administration (Term ${p.termID})`,
                projects: []
            };
        }
        acc[termKey].projects.push(p);
        return acc;
    }, {});

    const sortedTerms = Object.values(groupedData).sort((a: any, b: any) => {
        if (a.isCurrent !== b.isCurrent) return b.isCurrent - a.isCurrent;
        return b.termID - a.termID;
    });

    const handleCardClick = (batchID: number) => {
        navigate(`/project-list/${batchID}`);
    };

    const toggleFilter = (list: any[], setList: any, value: any) => {
        if (list.includes(value)) {
            setList(list.filter(v => v !== value));
        } else {
            setList([...list, value]);
        }
    };

    return (
        <div className={styles.bulletinPage}>
            <nav className={styles.nav}>
                <ul className={styles.navList}>
                    <li className={styles.navItem}><a href="/home">Home</a></li>
                    <li className={styles.navItem}><a href="/project-list" className={styles.activeLink}>Full-Disclosure Board</a></li>
                    <li className={styles.navItem}><button onClick={() => setIsLoginModalOpen(true)} className={styles.loginBtn}>Login</button></li>
                </ul>
            </nav>

            <header className={styles.heroHeader}>
                <div className={styles.heroContent}>
                    <h1>Digital Bulletin</h1>
                    <p>LGU Full-Disclosure Board for Finalized SK Projects.</p>
                </div>
            </header>

            <div className={styles.disclosureWrapper}>
                <aside className={styles.filterSidebar}>
                    <div className={styles.filterGroup}>
                        <h4>Barangay</h4>
                        {availableBarangays.map(b => (
                            <label key={b} className={styles.checkboxLabel}>
                                <input type="checkbox" checked={activeBarangays.includes(b)} onChange={() => toggleFilter(activeBarangays, setActiveBarangays, b)} /> {b}
                            </label>
                        ))}
                    </div>
                    <div className={styles.filterGroup}>
                        <h4>Type</h4>
                        <label className={styles.checkboxLabel}><input type="checkbox" checked={activeTypes.includes('CBYDP')} onChange={() => toggleFilter(activeTypes, setActiveTypes, 'CBYDP')} /> CBYDP</label>
                        <label className={styles.checkboxLabel}><input type="checkbox" checked={activeTypes.includes('ABYIP')} onChange={() => toggleFilter(activeTypes, setActiveTypes, 'ABYIP')} /> ABYIP</label>
                    </div>
                    <div className={styles.filterGroup}>
                        <h4>Status</h4>
                        <label className={styles.checkboxLabel}><input type="checkbox" checked={activeStatus.includes(1)} onChange={() => toggleFilter(activeStatus, setActiveStatus, 1)} /> Active</label>
                        <label className={styles.checkboxLabel}><input type="checkbox" checked={activeStatus.includes(0)} onChange={() => toggleFilter(activeStatus, setActiveStatus, 0)} /> Past</label>
                    </div>
                </aside>

                <main className={styles.mainBulletins}>
                    {loading ? <Loading /> : error ? (
                        <div className={styles.error}>{error}</div>
                    ) : (
                        sortedTerms.length > 0 ? (
                            sortedTerms.map((term: any) => (
                                <div key={term.termID} className={styles.termSection}>
                                    <h2 className={styles.termHeader}>{term.label}</h2>
                                    <div className={styles.bulletinGrid}>
                                        {term.projects.map((p: ProjectBatch) => (
                                            <DisclosureCard 
                                                key={p.batchID} 
                                                project={p} 
                                                customName={getDisplayName(p)}
                                                onClick={() => handleCardClick(p.batchID)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className={styles.emptyState}>
                                <h3>No results found</h3>
                                <p>Try adjusting your filters.</p>
                            </div>
                        )
                    )}
                </main>
            </div>

            <footer className={styles.footer}>
                <p>© 2025 Smart SK. Empowering youth governance through technology.</p>
            </footer>

            <Login open={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
        </div>
    );
};

export default DigitalBulletin;
