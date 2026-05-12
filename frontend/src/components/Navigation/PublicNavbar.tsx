import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    IconButton, Drawer, List, ListItem, 
    ListItemButton, ListItemText, Box 
} from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';
import styles from './PublicNavbar.module.css';

interface PublicNavbarProps {
    onLoginClick: () => void;
}

const PublicNavbar: React.FC<PublicNavbarProps> = ({ onLoginClick }) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const handleNavClick = (target: string) => {
        setMobileOpen(false);
        if (target.startsWith('#')) {
            if (location.pathname === '/home') {
                const element = document.querySelector(target);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                navigate('/home');
                // Note: Actual scrolling after navigation might need extra logic 
                // but usually home is fine as landing.
            }
        } else {
            navigate(target);
        }
    };

    const navItems = [
        { label: 'Home', target: '#home' },
        { label: 'Full-Disclosure Board', target: '/project-list' },
    ];

    const drawer = (
        <Box className={styles.drawerContainer}>
            <Box className={styles.drawerHeader}>
                <IconButton onClick={handleDrawerToggle}>
                    <CloseIcon />
                </IconButton>
            </Box>
            <List>
                {navItems.map((item) => (
                    <ListItem key={item.label} disablePadding>
                        <ListItemButton onClick={() => handleNavClick(item.target)} className={styles.drawerItem}>
                            <ListItemText primary={item.label} />
                        </ListItemButton>
                    </ListItem>
                ))}
                <ListItem disablePadding>
                    <ListItemButton onClick={() => { handleDrawerToggle(); onLoginClick(); }} className={`${styles.drawerItem} ${styles.mobileLogin}`}>
                        <ListItemText primary="Login" />
                    </ListItemButton>
                </ListItem>
            </List>
        </Box>
    );

    return (
        <>
            <nav className={`${styles.nav} ${isScrolled ? styles.scrolled : ''}`}>
                {/* Desktop Menu */}
                <ul className={styles.navList}>
                    {navItems.map((item) => (
                        <li key={item.label} className={styles.navItem}>
                            <button 
                                onClick={() => handleNavClick(item.target)} 
                                className={(item.target.startsWith('#') && location.pathname === '/home') || location.pathname.startsWith(item.target) ? styles.activeLink : ''}
                            >
                                {item.label}
                            </button>
                        </li>
                    ))}
                    <li className={styles.navItem}>
                        <button className={styles.loginBtn} onClick={onLoginClick}>Login</button>
                    </li>
                </ul>

                {/* Mobile Menu Icon */}
                <IconButton
                    color="inherit"
                    aria-label="open drawer"
                    edge="start"
                    onClick={handleDrawerToggle}
                    className={styles.menuButton}
                >
                    <MenuIcon />
                </IconButton>
            </nav>

            <Drawer
                variant="temporary"
                anchor="right"
                open={mobileOpen}
                onClose={handleDrawerToggle}
                ModalProps={{ keepMounted: true }}
                PaperProps={{ className: styles.drawerPaper }}
            >
                {drawer}
            </Drawer>
        </>
    );
};

export default PublicNavbar;
