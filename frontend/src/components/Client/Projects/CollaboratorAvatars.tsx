import React, { useMemo } from 'react';
import { Tooltip, Box, Typography } from '@mui/material';
import { CollaboratorInfo, getUserColor } from '../../../hooks/useCollaborationSocket';

interface CollaboratorAvatarsProps {
    collaborators: Map<number, CollaboratorInfo>;
    currentUser?: any;
}

/**
 * Renders a row of collaborator avatar circles in the top-right of the grid toolbar.
 * Each circle shows the position abbreviation (e.g. SKS) with the user's assigned color.
 */
const CollaboratorAvatars: React.FC<CollaboratorAvatarsProps> = ({ collaborators, currentUser }) => {

    // Combine remote collaborators and the current user
    const allUsers = useMemo(() => {
        const list = [...collaborators.values()];
        if (currentUser) {
            const uid = currentUser.id || currentUser.userID || 0;
            list.unshift({
                userID: uid,
                fullName: currentUser.fullName || 'You',
                position: currentUser.position || 'SKC',
                color: getUserColor(uid),
                cell: null, // Self cursor generally isn't needed here, just the avatar
                isSelf: true
            } as any);
        }
        return list;
    }, [collaborators, currentUser]);

    if (allUsers.length === 0) return null;

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {allUsers.map((collab) => (
                <Tooltip
                    key={`${collab.userID}-${(collab as any).isSelf ? 'self' : 'remote'}`}
                    title={`${collab.fullName} (${collab.position})${(collab as any).isSelf ? ' (You)' : ''}${collab.cell
                            ? ('r' in collab.cell && 'c' in collab.cell)
                                ? ` — Cell R${collab.cell.r + 1}C${collab.cell.c + 1}`
                                : ('cellId' in collab.cell)
                                    ? ` — Cell ${collab.cell.cellId.replace('cell-', '')}`
                                    : ' — Editing'
                            : ''
                        }`}
                    arrow
                >
                    <Box
                        sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            bgcolor: collab.color,
                            border: `3px solid ${collab.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: `0 0 0 2px white, 0 0 0 4px ${collab.color}`,
                            transition: 'transform 0.15s ease',
                            '&:hover': { transform: 'scale(1.15)' },
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{ color: '#fff', fontWeight: 700, fontSize: '0.55rem', letterSpacing: '-0.02em', lineHeight: 1 }}
                        >
                            {collab.position}
                        </Typography>
                    </Box>
                </Tooltip>
            ))}
        </Box>
    );
};

export default CollaboratorAvatars;
