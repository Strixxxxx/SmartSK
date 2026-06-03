import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../backend connection/axiosConfig';
import CircularProgress from '@mui/material/CircularProgress';
import { formatRoleName } from '../../../utils/roleUtils';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import styles from './checkpoint3to4.module.css';

interface SKMember {
    userID: number;
    fullName: string;
    position: string;
    attended: boolean;
}

interface Checkpoint3to4Props {
    batchID: number;
    isSKS: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const Checkpoint3to4: React.FC<Checkpoint3to4Props> = ({ batchID, isSKS, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [attendees, setAttendees] = useState<SKMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingAttendance, setSubmittingAttendance] = useState(false);
    const [submittingDocs, setSubmittingDocs] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [errorModal, setErrorModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });
    
    const [sessionDocs, setSessionDocs] = useState<{ attendanceSheetUrl: string, photoDocs: any[] } | null>(null);
    const [sessionDocsFiles, setSessionDocsFiles] = useState<File[]>([]);

    const docInputRef = useRef<HTMLInputElement>(null);

    const fetchAttendanceData = async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true);
            const res = await axios.get(`/api/project-tracker/status/${batchID}`);
            if (res.data.success) {
                if (res.data.data.attendees) {
                    setAttendees(res.data.data.attendees);
                }
                if (res.data.data.sessionDocs) {
                    setSessionDocs(res.data.data.sessionDocs);
                }
            }
        } catch (err) {
            console.error('Failed to fetch attendance data:', err);
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    useEffect(() => {
        fetchAttendanceData(false);

        if (!isSKS) {
            const pollInterval = setInterval(() => {
                fetchAttendanceData(true);
            }, 5000);

            return () => clearInterval(pollInterval);
        }
    }, [batchID, isSKS]);

    const handleToggleAttendance = (userID: number) => {
        if (!isSKS) return;
        setAttendees(prev => prev.map(member => 
            member.userID === userID ? { ...member, attended: !member.attended } : member
        ));
    };

    const handleSaveAttendance = async () => {
        try {
            setSubmittingAttendance(true);
            const payload = attendees.map(a => ({ userID: a.userID, attended: a.attended }));
            
            const res = await axios.post('/api/project-tracker/submit-self-attendance', {
                batchID,
                attendance: payload,
            });

            if (res.data.success) {
                alert('Attendance saved successfully.');
                fetchAttendanceData();
                onSuccess();
            }
        } catch (err: any) {
            const errMsg = err.response?.data?.message || 'Failed to submit attendance.';
            alert(errMsg);
        } finally {
            setSubmittingAttendance(false);
        }
    };

    const handleUploadDocs = async () => {
        if (sessionDocsFiles.length === 0) {
            setErrorModal({ isOpen: true, message: 'Please select at least one Session Documentation file before uploading.' });
            return;
        }

        try {
            setSubmittingDocs(true);
            const formData = new FormData();
            formData.append('batchID', batchID.toString());
            sessionDocsFiles.forEach(f => formData.append('sessionDoc', f));

            const res = await axios.post('/api/project-tracker/upload-session-docs', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                alert('Session documents uploaded successfully! The SK Chairperson will now review them.');
                onSuccess();
                onClose();
            }
        } catch (err: any) {
            const errMsg = err.response?.data?.message || 'Failed to upload session documents.';
            setErrorModal({ isOpen: true, message: errMsg });
        } finally {
            setSubmittingDocs(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 0' }}>
                <CircularProgress style={{ color: '#4f46e5' }} />
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <p className={styles.instruction}>
                {isSKS 
                    ? "Manage the attendance for this session. Make sure to accurately mark present officials. Once done, upload the physical attendance sheet and session documentation photos."
                    : "This table shows the attendance record for this session in read-only mode. Only the SK Secretary can mark attendance and upload session documentation. You may view this for transparency."
                }
            </p>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th} style={{ width: '80px', textAlign: 'center' }}>Present</th>
                            <th className={styles.th}>Position</th>
                            <th className={styles.th}>Full Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        {attendees.map((member) => {
                            const isMe = member.userID === user?.id;

                            return (
                                <tr key={member.userID} className={`${styles.tr} ${isMe ? styles.currentUserRow : ''}`}>
                                    <td className={styles.td} style={{ textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            className={styles.checkbox}
                                            checked={member.attended}
                                            disabled={!isSKS}
                                            onChange={() => handleToggleAttendance(member.userID)}
                                        />
                                    </td>
                                    <td className={styles.td} style={{ fontWeight: isMe ? 600 : 400, whiteSpace: 'nowrap' }}>
                                        {formatRoleName(member.position)}
                                        {isMe && <span className={`${styles.badge} ${styles.badgeSuccess}`} style={{ marginLeft: '8px' }}>You</span>}
                                    </td>
                                    <td className={styles.td} style={{ fontWeight: isMe ? 600 : 400 }}>
                                        {member.fullName}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {isSKS && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', marginTop: '16px', marginBottom: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', fontWeight: 500, color: '#374151' }}>
                        <input
                            type="checkbox"
                            checked={attendees.length > 0 && attendees.every(a => a.attended)}
                            onChange={(e) => {
                                const isChecked = e.target.checked;
                                setAttendees(prev => prev.map(member => ({ ...member, attended: isChecked })));
                            }}
                            className={styles.checkbox}
                        />
                        Check All
                    </label>
                    <button 
                        className={`${styles.btn} ${styles.btnPrimary}`} 
                        onClick={handleSaveAttendance}
                        disabled={submittingAttendance}
                    >
                        {submittingAttendance ? 'Saving...' : 'Save Attendance Record'}
                    </button>
                </div>
            )}

            {sessionDocs?.attendanceSheetUrl && (
                <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#e0e7ff', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                    <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#3730a3' }}>System-Generated Attendance Sheet</p>
                    <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#4f46e5' }}>The attendance sheet has been successfully generated based on the saved record.</p>
                    <button 
                        onClick={() => setShowPdfModal(true)} 
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#4f46e5', textDecoration: 'underline', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <PictureAsPdfIcon fontSize="small" />
                        Preview Attendance Sheet (PDF)
                    </button>
                </div>
            )}

            {showPdfModal && sessionDocs?.attendanceSheetUrl && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ width: '100%', maxWidth: '900px', height: '90vh', backgroundColor: 'white', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                            <h3 style={{ margin: 0, color: '#111827', fontSize: '1.125rem' }}>Attendance Sheet Preview</h3>
                            <button 
                                onClick={() => setShowPdfModal(false)} 
                                style={{ border: 'none', background: '#f3f4f6', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, color: '#4b5563' }}
                            >
                                Close
                            </button>
                        </div>
                        <div style={{ flex: 1, backgroundColor: '#e5e7eb' }}>
                            <iframe src={sessionDocs.attendanceSheetUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Attendance Sheet Preview" />
                        </div>
                    </div>
                </div>
            )}

            {isSKS && (
                <div className={styles.uploadSection}>
                    <h4 className={styles.uploadTitle}>Submit Session Documents</h4>
                    <p className={styles.uploadSubTitle}>Upload the required proof of session for the Chairperson's validation. All three items below are required before submission.</p>

                    <div className={styles.uploadGrid}>

                        {/* ── Session Documentation ── */}
                        <div className={styles.uploadCard}>
                            <label className={styles.uploadLabel}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📄 Session Documentation
                                <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                            </label>
                            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>
                                Upload the minutes of the meeting, resolution, or any official session document (PDF, Word, Excel, Images).
                            </p>
                            <input
                                type="file"
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                ref={docInputRef}
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
                                    const oversizedImages = files.filter(f => f.type.toLowerCase().startsWith('image/') && f.size > MAX_IMAGE_SIZE);
                                    
                                    if (oversizedImages.length > 0) {
                                        setErrorModal({ 
                                            isOpen: true, 
                                            message: `Image file size must not exceed 2MB per photo.\n\nOversized files:\n${oversizedImages.map(f => f.name).join('\n')}` 
                                        });
                                        if (docInputRef.current) docInputRef.current.value = '';
                                        return;
                                    }
                                    setSessionDocsFiles(files);
                                }}
                            />
                            <div
                                className={styles.uploadBox}
                                onClick={() => docInputRef.current?.click()}
                                style={{ borderColor: sessionDocsFiles.length > 0 ? '#10b981' : undefined }}
                            >
                                <FileUploadIcon style={{ color: sessionDocsFiles.length > 0 ? '#10b981' : '#4f46e5', fontSize: 32, marginBottom: '8px' }} />
                                {sessionDocsFiles.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                        <span className={styles.fileName} style={{ color: '#10b981' }}>✓ {sessionDocsFiles.length} file(s) selected</span>
                                        <span style={{ fontSize: '12px', color: '#6b7280' }}>Click to change</span>
                                    </div>
                                ) : (
                                    <span>Click to upload Documents or Photos</span>
                                )}
                            </div>
                        </div>

                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            style={{ backgroundColor: '#10b981', display: 'flex', gap: '8px', alignItems: 'center' }}
                            onClick={handleUploadDocs}
                            disabled={submittingDocs || sessionDocsFiles.length === 0}
                        >
                            <FileUploadIcon fontSize="small" />
                            {submittingDocs ? 'Uploading...' : 'Submit Session Documents'}
                        </button>
                    </div>
                </div>
            )}

            {errorModal.isOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'white', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ padding: '16px 20px', backgroundColor: '#fee2e2', borderBottom: '1px solid #f87171' }}>
                            <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1.125rem', fontWeight: 600 }}>Notice</h3>
                        </div>
                        <div style={{ padding: '20px', color: '#374151', fontSize: '15px', whiteSpace: 'pre-wrap' }}>
                            {errorModal.message}
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
                            <button 
                                onClick={() => setErrorModal({ isOpen: false, message: '' })} 
                                style={{ border: 'none', background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isSKS && (
                <div className={styles.footer}>
                    <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
                        Close
                    </button>
                </div>
            )}
        </div>
    );
};

export default Checkpoint3to4;
