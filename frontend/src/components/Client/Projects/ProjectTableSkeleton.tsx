import React from 'react';
import { Skeleton, Box, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';
import styles from './ProjectTemplate.module.css';

interface ProjectTableSkeletonProps {
    projType: 'ABYIP' | 'CBYDP';
}

const ProjectTableSkeleton: React.FC<ProjectTableSkeletonProps> = ({ projType }) => {
    // Mimic the column structure for CBYDP/ABYIP
    const rowCount = 5;
    const colCount = projType === 'ABYIP' ? 12 : 10;

    return (
        <Box className={styles['pt-table-wrapper']} sx={{ opacity: 0.8 }}>
            <Table className={styles['pt-table']}>
                <TableHead>
                    {/* Title Rows */}
                    <TableRow>
                        <TableCell colSpan={colCount} sx={{ p: 2, textAlign: 'center' }}>
                            <Skeleton variant="rectangular" width="40%" height={28} sx={{ margin: '0 auto', borderRadius: 1 }} />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell colSpan={colCount} sx={{ p: 1, textAlign: 'center' }}>
                            <Skeleton variant="rectangular" width="25%" height={20} sx={{ margin: '0 auto', borderRadius: 1 }} />
                        </TableCell>
                    </TableRow>
                    
                    {/* Header Cells */}
                    <TableRow className={styles['pt-col-header']}>
                        {Array.from({ length: colCount }).map((_, i) => (
                            <TableCell key={i} sx={{ border: '1px solid #e0d9c4', p: 1.5, bgcolor: '#f1f1f1' }}>
                                <Skeleton variant="rectangular" height={24} sx={{ borderRadius: 0.5 }} />
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {Array.from({ length: rowCount }).map((_, rowIndex) => (
                        <React.Fragment key={rowIndex}>
                            {/* Section divider for CBYDP */}
                            {projType === 'CBYDP' && rowIndex === 0 && (
                                <TableRow>
                                    <TableCell colSpan={colCount} sx={{ bgcolor: '#f9f9f9', p: 1.5 }}>
                                        <Skeleton variant="rectangular" width="120px" height={20} sx={{ borderRadius: 0.5 }} />
                                    </TableCell>
                                </TableRow>
                            )}
                            <TableRow>
                                {Array.from({ length: colCount }).map((_, colIndex) => (
                                    <TableCell key={colIndex} sx={{ border: '1px solid #e0d9c4', p: 1, height: '70px' }}>
                                        <Skeleton variant="rectangular" height="100%" sx={{ borderRadius: 0.5 }} />
                                    </TableCell>
                                ))}
                            </TableRow>
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </Box>
    );
};

export default ProjectTableSkeleton;
