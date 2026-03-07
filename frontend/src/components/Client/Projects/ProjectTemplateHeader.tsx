import React from 'react';
import SB_logo from '../../../assets/logos/SB.png';
import NN_logo from '../../../assets/logos/NN.png';
import SK_logo from '../../../assets/logos/sk_logo.png';
import './ProjectTemplate.css';

interface ProjectTemplateHeaderProps {
    projType: 'ABYIP' | 'CBYDP';
    projName: string;      // e.g. "ABYIP_SB_2026.xlsx"
    barangay: 'SB' | 'NN';
    fiscalYear: string;    // e.g. "2026" or "2023-2025"
    centerOfParticipation: string;
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
}) => {
    const leftLogo = barangay === 'SB' ? SB_logo : NN_logo;
    const barangayName = BARANGAY_NAME[barangay] ?? 'BARANGAY';

    return (
        <div className="pt-header-wrapper">
            <div className="pt-header-container">
                {/* ── Top Logo Row ── */}
                <div className="pt-header-logo-row">
                    <div className="pt-header-logo-left">
                        <img src={leftLogo} alt={`${barangay} logo`} />
                    </div>

                    <div className="pt-header-center">
                        <p>REPUBLIC OF THE PHILIPPINES</p>
                        <p className="bold">{barangayName}</p>
                        {projType === 'ABYIP' && (
                            <p className="bold">SANGGUNIANG KABATAAN</p>
                        )}
                        <p>DISTRICT V, QUEZON CITY</p>
                    </div>

                    <div className="pt-header-logo-right">
                        <img src={SK_logo} alt="SK logo" />
                    </div>
                </div>
            </div>

            {/* ── Sub-header Text ── */}
            <div className="pt-subheader">
                <p>
                    <span className="bold">CENTER OF PARTICIPATION: &nbsp;</span>
                    <span className="bold">{centerOfParticipation.toUpperCase()}</span>
                </p>
                {projType === 'CBYDP' && (
                    <p><span className="bold">AGENDA STATEMENT:</span></p>
                )}
            </div>
        </div>
    );
};

export default ProjectTemplateHeader;
