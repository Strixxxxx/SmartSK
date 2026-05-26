import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../backend connection/axiosConfig';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CircularProgress from '@mui/material/CircularProgress';
import { formatRoleName } from '../../../utils/roleUtils';
import styles from './checkpoint3to4.module.css';

interface SKMember {
    userID: number;
    fullName: string;
    position: string;
    attended: boolean;
    comments: string;
}

interface Checkpoint3to4Props {
    batchID: number;
    onClose: () => void;
    onSuccess: () => void;
}

const Checkpoint3to4: React.FC<Checkpoint3to4Props> = ({ batchID, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [attendees, setAttendees] = useState<SKMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Track expanded rows by userID
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

    // Local changes for current logged-in user only
    const [myAttendance, setMyAttendance] = useState<boolean>(false);
    const [myComments, setMyComments] = useState<string>('');

    const fetchAttendanceData = async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true);
            const res = await axios.get(`/api/project-tracker/status/${batchID}`);
            if (res.data.success && res.data.data.attendees) {
                const fetchedList: SKMember[] = res.data.data.attendees;
                setAttendees(fetchedList);

                // Find logged-in user's record
                const myRecord = fetchedList.find((member) => member.userID === user?.id);
                if (myRecord && !isBackground) {
                    setMyAttendance(myRecord.attended);
                    setMyComments(myRecord.comments || '');
                }
            }
        } catch (err) {
            console.error('Failed to fetch attendance data:', err);
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    useEffect(() => {
        // Initial fetch (full spinner loading)
        fetchAttendanceData(false);

        // Background polling every 5 seconds for real-time soft updates
        const pollInterval = setInterval(() => {
            fetchAttendanceData(true);
        }, 5000);

        return () => clearInterval(pollInterval);
    }, [batchID, user?.id]);

    const toggleExpand = (userID: number) => {
        setExpandedRows((prev) => ({
            ...prev,
            [userID]: !prev[userID],
        }));
    };

    const handleSaveSelf = async () => {
        try {
            setSubmitting(true);
            const res = await axios.post('/api/project-tracker/submit-self-attendance', {
                batchID,
                attended: myAttendance,
                comments: myComments,
            });

            if (res.data.success) {
                alert('Your check-in status has been updated successfully!');
                onSuccess(); // Refresh main details
                onClose();   // Close modal
            }
        } catch (err: any) {
            const errMsg = err.response?.data?.message || 'Failed to submit check-in.';
            alert(errMsg);
        } finally {
            setSubmitting(false);
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
                This table shows the official list of SK Council members. You are allowed to toggle check-in and add comments 
                <strong> only for your own row</strong>. Check-in changes are shared in real-time, and once all members have checked in, the project plan will progress to Checkpoint 4 (Brgy. Captain's Approval).
            </p>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th} style={{ width: '80px' }}>Status</th>
                            <th className={styles.th}>Position</th>
                            <th className={styles.th}>Full Name</th>
                            <th className={styles.th} style={{ width: '120px', textAlign: 'center' }}>Comments</th>
                        </tr>
                    </thead>
                    <tbody>
                        {attendees.map((member) => {
                            const isMe = member.userID === user?.id;
                            const isChecked = isMe ? myAttendance : member.attended;
                            const isExpanded = !!expandedRows[member.userID];

                            return (
                                <React.Fragment key={member.userID}>
                                    <tr className={`${styles.tr} ${isMe ? styles.currentUserRow : ''}`}>
                                        <td className={styles.td} style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                className={styles.checkbox}
                                                checked={isChecked}
                                                disabled={!isMe}
                                                onChange={(e) => setMyAttendance(e.target.checked)}
                                            />
                                        </td>
                                        <td className={styles.td} style={{ fontWeight: isMe ? 600 : 400, whiteSpace: 'nowrap' }}>
                                            {formatRoleName(member.position)}
                                            {isMe && <span className={`${styles.badge} ${styles.badgeSuccess}`} style={{ marginLeft: '8px' }}>You</span>}
                                        </td>
                                        <td className={styles.td} style={{ fontWeight: isMe ? 600 : 400 }}>
                                            {member.fullName}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center' }}>
                                            <button 
                                                className={styles.expandBtn} 
                                                onClick={() => toggleExpand(member.userID)}
                                            >
                                                {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                                <span>Thoughts</span>
                                            </button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className={styles.expandRow}>
                                            <td colSpan={4} className={styles.td} style={{ padding: 0 }}>
                                                <div className={styles.expandContainer}>
                                                    {isMe ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#4b5563' }}>
                                                                My thoughts during this SK legislative session:
                                                            </label>
                                                            <textarea
                                                                className={styles.commentArea}
                                                                placeholder="Enter your comments or suggestions..."
                                                                value={myComments}
                                                                onChange={(e) => setMyComments(e.target.value)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>
                                                                Thoughts submitted by {member.fullName}:
                                                            </label>
                                                            {member.comments ? (
                                                                <div className={styles.readOnlyComment}>
                                                                    "{member.comments}"
                                                                </div>
                                                            ) : (
                                                                <span className={styles.noCommentText}>
                                                                    No comments shared yet.
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className={styles.footer}>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
                    Close
                </button>
                {attendees.some((m) => m.userID === user?.id) && (
                    <button 
                        className={`${styles.btn} ${styles.btnPrimary}`} 
                        onClick={handleSaveSelf}
                        disabled={submitting}
                    >
                        {submitting ? 'Saving Check-in...' : 'Submit My Check-in'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default Checkpoint3to4;
