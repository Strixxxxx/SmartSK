import React, { useEffect, useState } from 'react';
import styles from './Portfolio.module.css';
import logoUrl from '../../assets/logo.gif';
import nnLogo from '../../assets/NN_LOGO.jpg';
import sbLogo from '../../assets/SB_LOGO.jpg';
import Login from '../Login/Login';

const Portfolio: React.FC = () => {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [teamView, setTeamView] = useState(0); // 0 = team, 1 = collaboration

  useEffect(() => {
    console.log('Smart SK Portfolio v2.0 (Modular) loaded');
    // Simple reveal animation on scroll
    const revealElements = () => {
      const reveals = document.querySelectorAll(`.${styles.reveal}`);
      reveals.forEach(el => {
        const elementTop = el.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;
        if (elementTop < windowHeight * 0.85) {
          el.classList.add(styles.revealVisible);
        }
      });
    };

    window.addEventListener('scroll', revealElements);
    revealElements(); // Initial check

    return () => window.removeEventListener('scroll', revealElements);
  }, []);

  const handleNavClick = (targetId: string) => {
    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const handlePrevView = () => {
    setTeamView((prev) => (prev === 0 ? 1 : 0));
  };

  const handleNextView = () => {
    setTeamView((prev) => (prev === 1 ? 0 : 1));
  };

  return (
    <div className={styles.portfolio}>
      <nav className={styles.nav}>
        <ul className={styles.navList}>
          <li className={styles.navItem}>
            <button onClick={() => handleNavClick('#home')} type="button">Home</button>
          </li>
          <li className={styles.navItem}>
            <a href="/project-list">Full-Disclosure Board</a>
          </li>
          <li className={styles.navItem}>
            <button className={styles.loginBtn} onClick={() => setIsLoginModalOpen(true)}>Login</button>
          </li>
        </ul>
      </nav>

      <header id="home" className={styles.header}>
        <div className={styles.heroContent}>
          <div className={styles.reveal}>
            <div className={styles.logoWrapper}>
              <img src={logoUrl} alt="Smart SK Logo" className={styles.logoImg} />
            </div>
            <h1 className={styles.title}>Smart SK</h1>
            <p className={styles.subtitle}>Intelligent Project Monitoring System for Sangguniang Kabataan</p>
            <div className={styles.heroStats}>
              <div className={styles.statItem}>
                <span className={styles.statNumber}>2</span>
                <span className={styles.statLabel}>Barangays</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statNumber}>AI</span>
                <span className={styles.statLabel}>Powered</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statNumber}>100%</span>
                <span className={styles.statLabel}>Web-Based</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="about" className={`${styles.section} ${styles.reveal}`}>
        <div className={styles.aboutContent}>
          <div className={styles.aboutText}>
            <h2 className={styles.sectionTitle}>About Smart SK</h2>
            <p>Smart SK revolutionizes how Sangguniang Kabataan monitor projects by providing a centralized, AI-powered platform that streamlines workflows and enhances decision-making through data-driven insights.</p>
            <p>Our system integrates advanced forecasting capabilities with user-friendly interfaces, enabling SK officials across District 5 Quezon City to efficiently track proposals, manage budgets, and predict project outcomes.</p>
            <div className={styles.techStack}>
              <span className={styles.techItem}>React + TypeScript</span>
              <span className={styles.techItem}>Node.js + Express</span>
              <span className={styles.techItem}>MSSQL Database</span>
              <span className={styles.techItem}>Python + Google Gemini AI</span>
            </div>
          </div>
          <div className={styles.aboutVisual}>
            <div className={styles.codePreview}>
              <pre style={{ color: '#d4d4d4', margin: 0 }}>
                {`// AI-Powered Forecasting
const predictSuccess = async (data) => {
  const forecast = await Prophet.predict(data);
  const insights = await Gemini.analyze(forecast);
  
  return {
    successRate: forecast.probability,
    recommendations: insights.suggestions,
    budget: forecast.budget
  };
};`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className={`${styles.section} ${styles.reveal}`}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Powerful Features</h2>
          <p className={styles.sectionSubtitle}>Comprehensive tools designed to streamline SK project monitoring and enhance decision-making</p>
        </div>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🧠</div>
            <h3>AI-Powered Forecasting</h3>
            <p>Advanced machine learning algorithms analyze historical data to predict project budget requirements based on the historical data.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📊</div>
            <h3>Predictive Analysis</h3>
            <p>Leverage Google Gemini AI for intelligent insights, recommendations, and strategic guidance based on comprehensive data analysis.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔒</div>
            <h3>Secure Authentication</h3>
            <p>Enterprise-grade security with JWT-based authentication, role-based access control, and comprehensive audit trails.</p>
          </div>
        </div>
      </section>

      <section id="team" className={`${styles.section} ${styles.reveal}`}>
        {/* Synchronized Header Slider */}
        <div className={`${styles.sliderContainer} ${styles.headerSlider}`}>
          <div className={`${styles.sliderTrack} ${teamView === 0 ? styles.slideLeft : styles.slideRight}`}>
            <div className={styles.slideView}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Development Team</h2>
                <p className={styles.sectionSubtitle}>Meet the innovators behind Smart SK</p>
              </div>
            </div>
            <div className={styles.slideView}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Our Partners</h2>
                <p className={styles.sectionSubtitle}>Building stronger communities together</p>
              </div>
            </div>
          </div>
        </div>

        {/* Synchronized Card Slider with navigation buttons centered strictly on cards */}
        <div className={styles.teamWrapper}>
          <button className={styles.navBtn} onClick={handlePrevView}>&#8249;</button>

          <div className={`${styles.sliderContainer} ${styles.cardSlider}`}>
            <div className={`${styles.sliderTrack} ${teamView === 0 ? styles.slideLeft : styles.slideRight}`}>

              {/* Slide 1: Development Team Members */}
              <div className={styles.slideView}>
                <div className={styles.teamGrid}>
                  <div className={styles.teamCard}>
                    <div className={styles.avatar}>JB</div>
                    <h3>Jeff Bontuyan</h3>
                    <p>Project Manager</p>
                  </div>
                  <div className={styles.teamCard}>
                    <div className={styles.avatar}>LA</div>
                    <h3>Luis De Guzman</h3>
                    <p>Lead Programmer</p>
                  </div>
                  <div className={styles.teamCard}>
                    <div className={styles.avatar}>RB</div>
                    <h3>Reign Balagtas</h3>
                    <p>System Analyst</p>
                  </div>
                  <div className={styles.teamCard}>
                    <div className={styles.avatar}>YA</div>
                    <h3>Yasmien Ando</h3>
                    <p>Quality Assurance</p>
                  </div>
                </div>
              </div>

              {/* Slide 2: Partners (Balanced 2-card layout) */}
              <div className={styles.slideView}>
                <div className={styles.partnersGrid}>
                  <div className={styles.teamCard}>
                    <img src={nnLogo} alt="Partner Logo" className={styles.logoImg} style={{ width: '100px', height: '100px', margin: '0 auto 1.5rem', display: 'block' }} />
                    <h3>Barangay Nagkaisang Nayon</h3>
                    <p>District 5, Quezon City</p>
                  </div>
                  <div className={styles.teamCard}>
                    <img src={sbLogo} alt="Partner Logo" className={styles.logoImg} style={{ width: '100px', height: '100px', margin: '0 auto 1.5rem', display: 'block' }} />
                    <h3>Barangay San Bartolome</h3>
                    <p>District 5, Quezon City</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <button className={styles.navBtn} onClick={handleNextView}>&#8250;</button>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.contactInfo}>
          <div className={styles.contactItem}><span>📧</span> smartsk2025@gmail.com</div>
          <div className={styles.contactItem}><span>🏫</span> STI College Novaliches</div>
        </div>
        <p className={styles.copyright}>© 2025 Smart SK. Empowering youth governance through technology.</p>
      </footer>

      <Login
        open={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </div>
  );
};

export default Portfolio;