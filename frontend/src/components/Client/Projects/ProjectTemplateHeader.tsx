import React, { useState, useEffect } from 'react';
import { TextField } from '@mui/material';
import SB_logo from '../../../assets/logos/SB.png';
import NN_logo from '../../../assets/logos/NN.png';
import SK_logo from '../../../assets/logos/sk_logo.png';
import styles from './ProjectTemplate.module.css';

interface ProjectTemplateHeaderProps {
    projType: 'ABYIP' | 'CBYDP';
    projName: string;      // e.g. "ABYIP_SB_2026.xlsx"
    barangay: 'SB' | 'NN';
    fiscalYear: string;    // e.g. "2026" or "2023-2025"
    centerOfParticipation: string;
    agendaStatement?: string;
    onAgendaSave?: (newValue: string) => void;
    readOnly?: boolean;
}

const BARANGAY_NAME: Record<string, string> = {
    SB: 'BARANGAY SAN BARTOLOME',
    NN: 'BARANGAY NAGKAISANG NAYON',
};

const ProjectTemplateHeader: React.FC<ProjectTemplateHeaderProps> = ({
    projType,
    barangay,
    fiscalYear: _fiscalYear,
    centerOfParticipation,
    agendaStatement = '',
    onAgendaSave,
    readOnly = false,
}) => {
    const leftLogo = barangay === 'SB' ? SB_logo : NN_logo;
    const barangayName = BARANGAY_NAME[barangay] ?? 'BARANGAY';

    const [localAgenda, setLocalAgenda] = useState(agendaStatement);

    useEffect(() => {
        setLocalAgenda(agendaStatement);
    }, [agendaStatement]);

    const handleBlur = () => {
        if (localAgenda !== agendaStatement && onAgendaSave) {
            onAgendaSave(localAgenda);
        }
    };

    return (
        <div className={styles['pt-header-wrapper']}>
            <div className={styles['pt-header-container']}>
                {/* ── Top Logo Row ── */}
                <div className={styles['pt-header-logo-row']}>
                    <div className={styles['pt-header-logo-left']}>
                        <img 
                            src={leftLogo} 
                            alt={`${barangay} logo`} 
                            fetchPriority="high" 
                            loading="eager"
                        />
                    </div>

                    <div className={styles['pt-header-center']}>
                        <p>REPUBLIC OF THE PHILIPPINES</p>
                        <p className={styles.bold}>{barangayName}</p>
                        {projType === 'ABYIP' && (
                            <p className={styles.bold}>SANGGUNIANG KABATAAN</p>
                        )}
                        <p>DISTRICT V, QUEZON CITY</p>
                    </div>

                    <div className={styles['pt-header-logo-right']}>
                        <img 
                            src={SK_logo} 
                            alt="SK logo" 
                            fetchPriority="high" 
                            loading="eager"
                        />
                    </div>
                </div>
            </div>

            {/* ── Sub-header Text ── */}
            <div className={styles['pt-subheader']}>
                <p>
                    <span className={styles.bold}>CENTER OF PARTICIPATION: &nbsp;</span>
                    <span className={styles.bold}>{centerOfParticipation.toUpperCase()}</span>
                </p>
                {projType === 'CBYDP' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                        <p><span className={styles.bold}>AGENDA STATEMENT:</span></p>
                        <TextField
                            multiline
                            minRows={2}
                            maxRows={6}
                            value={localAgenda}
                            onChange={(e) => setLocalAgenda(e.target.value)}
                            onBlur={handleBlur}
                            disabled={readOnly}
                            placeholder="Enter agenda statement here..."
                            variant="outlined"
                            fullWidth
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: '#fff',
                                    fontSize: '0.9rem',
                                    fontFamily: 'Calibri, sans-serif',
                                    '&.Mui-disabled': {
                                        color: '#000',
                                        WebkitTextFillColor: '#000',
                                        border: '1px solid #ddd'
                                    }
                                },
                                '& .MuiInputBase-input.Mui-disabled': {
                                    opacity: 1,
                                    color: '#000',
                                    WebkitTextFillColor: '#000'
                                }
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectTemplateHeader;
