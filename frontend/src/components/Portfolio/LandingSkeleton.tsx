import React from 'react';
import styles from './LandingSkeleton.module.css';

const LandingSkeleton: React.FC = () => {
    return (
        <div className={styles.skeletonWrapper}>
            <nav className={styles.skeletonNav}>
                <div className={styles.skeletonLogo} />
                <div className={styles.skeletonNavLinks}>
                    <div className={styles.skeletonNavLink} />
                    <div className={styles.skeletonNavLink} />
                    <div className={styles.skeletonNavLink} />
                </div>
            </nav>

            <header className={styles.skeletonHero}>
                <div className={styles.skeletonHeroLogo} />
                <div className={styles.skeletonHeroTitle} />
                <div className={styles.skeletonHeroSubtitle} />
                <div className={styles.skeletonHeroStats}>
                    <div className={styles.skeletonStatCard} />
                    <div className={styles.skeletonStatCard} />
                    <div className={styles.skeletonStatCard} />
                </div>
            </header>

            <section className={styles.skeletonGrid}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className={styles.skeletonFeatureCard} />
                ))}
            </section>
        </div>
    );
};

export default LandingSkeleton;
