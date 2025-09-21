import React, { useEffect, useState } from 'react';
import './Portfolio.css';
import logoUrl from '../../assets/logo.gif';
import Portal from '../Portal/portal';
import Login from '../Login/Login';

const Portfolio: React.FC = () => {
  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState('');

  useEffect(() => {
    // Create animated particles
    const createParticles = () => {
      const particles = document.getElementById('particles');
      if (particles) {
        particles.innerHTML = ''; // Clear existing particles
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
          const particle = document.createElement('div');
          particle.className = 'particle';
          particle.style.left = Math.random() * 100 + '%';
          particle.style.animationDelay = Math.random() * 20 + 's';
          particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
          particles.appendChild(particle);
        }
      }
    };

    // Scroll animations
    const animateOnScroll = () => {
      const elements = document.querySelectorAll('.animate-on-scroll');
      
      elements.forEach(element => {
        const el = element as HTMLElement;
        const elementTop = el.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;
        
        if (elementTop < windowHeight * 0.85) {
          el.classList.add('visible');
        }
      });
    };

    createParticles();
    animateOnScroll();
    window.addEventListener('scroll', animateOnScroll);
    
    return () => {
      window.removeEventListener('scroll', animateOnScroll);
    };
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

  const handleBarangaySelect = (barangay: string) => {
    setSelectedBarangay(barangay);
    setIsPortalOpen(false);
    setIsLoginModalOpen(true);
  };
  
  return (
    <>
      <div className="portfolio">
        <div className="particles" id="particles"></div>

        <nav>
          <ul>
            <li><button onClick={() => handleNavClick('#home')} type="button">Home</button></li>
            <li><a href="/project-list">Projects</a></li>
            <li><button onClick={() => setIsPortalOpen(true)}>Login</button></li>
          </ul>
        </nav>

        <header id="home">
          <div className="hero-content">
            <div className="logo-wrapper">
              <img src={logoUrl} alt="Smart SK Logo" />
            </div>
            <h1>Smart SK</h1>
            <p className="subtitle">Intelligent Project Monitoring System for Sangguniang Kabataan</p>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-number">2</span>
                <span className="stat-label">Barangays</span>
              </div>
              <div className="stat">
                <span className="stat-number">AI</span>
                <span className="stat-label">Powered</span>
              </div>
              <div className="stat">
                <span className="stat-number">100%</span>
                <span className="stat-label">Web-Based</span>
              </div>
            </div>
          </div>
        </header>

        <section id="about" className="animate-on-scroll">
          <div className="section-header">
            <h2 className="section-title">About Smart SK</h2>
            <p className="section-subtitle">Transforming youth governance through intelligent project monitoring and predictive analytics</p>
          </div>
          <div className="about-content">
            <div className="about-text">
              <p>Smart SK revolutionizes how Sangguniang Kabataan monitor projects by providing a centralized, AI-powered platform that streamlines workflows and enhances decision-making through data-driven insights.</p>
              <p>Our system integrates advanced forecasting capabilities with user-friendly interfaces, enabling SK officials across District 5 Quezon City to efficiently track proposals, manage budgets, and predict project outcomes.</p>
              <div className="tech-stack">
                <span className="tech-item">React + TypeScript</span>
                <span className="tech-item">Node.js + Express</span>
                <span className="tech-item">MSSQL Database</span>
                <span className="tech-item">Python + Google Gemini AI</span>
              </div>
            </div>
            <div className="about-visual">
              <div className="code-preview">
                <span className="code-line"><span className="comment">{"// AI-Powered Project Forecasting"}</span></span>
                <span className="code-line"><span className="keyword">const</span> <span className="string">predictProjectSuccess</span> = <span className="keyword">async</span> (projectData) =&gt; {"{"}</span>
                <span className="code-line">&nbsp;&nbsp;<span className="keyword">const</span> forecast = <span className="keyword">await</span> <span className="string">Prophet.predict</span>(projectData);</span>
                <span className="code-line">&nbsp;&nbsp;<span className="keyword">const</span> aiInsights = <span className="keyword">await</span> <span className="string">Gemini.analyze</span>(forecast);</span>
                <span className="code-line">&nbsp;&nbsp;</span>
                <span className="code-line">&nbsp;&nbsp;<span className="keyword">return</span> {"{"}</span>
                <span className="code-line">&nbsp;&nbsp;&nbsp;&nbsp;<span className="string">successRate</span>: forecast.probability,</span>
                <span className="code-line">&nbsp;&nbsp;&nbsp;&nbsp;<span className="string">recommendations</span>: aiInsights.suggestions,</span>
                <span className="code-line">&nbsp;&nbsp;&nbsp;&nbsp;<span className="string">budgetForecast</span>: forecast.budget</span>
                <span className="code-line">&nbsp;&nbsp;{"}"};</span>
                <span className="code-line">{"}"};</span>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="animate-on-scroll">
          <div className="section-header">
            <h2 className="section-title">Powerful Features</h2>
            <p className="section-subtitle">Comprehensive tools designed to streamline SK project monitoring and enhance decision-making</p>
          </div>
          <div className="features-grid">
              <div className="feature-card">
                  <div className="feature-icon">🧠</div>
                  <h3>AI-Powered Forecasting</h3>
                  <p>Advanced machine learning algorithms analyze historical data to predict project budget requirements based on the historical data.</p>
              </div>
              <div className="feature-card">
                  <div className="feature-icon">📊</div>
                  <h3>Predictive Analysis</h3>
                  <p>Leverage Google Gemini AI for intelligent insights, recommendations, and strategic guidance based on comprehensive data analysis.</p>
              </div>
              <div className="feature-card">
                  <div className="feature-icon">🔐</div>
                  <h3>Secure Authentication</h3>
                  <p>Enterprise-grade security with JWT-based authentication, role-based access control, and comprehensive audit trails.</p>
              </div>
              <div className="feature-card">
                  <div className="feature-icon">👥</div>
                  <h3>Multi-Barangay Support</h3>
                  <p>Centralized platform supporting 2 barangays in District 5, enabling collaboration and performance comparison.</p>
              </div>
              <div className="feature-card">
                  <div className="feature-icon">📋</div>
                  <h3>Project Lifecycle Monitoring</h3>
                  <p>Complete project tracking from proposal submission to completion, with real-time status updates and notifications.</p>
              </div>
              <div className="feature-card">
                  <div className="feature-icon">💾</div>
                  <h3>Database Management</h3>
                  <p>Robust MSSQL database with automated backups, data integrity checks, and seamless archival systems.</p>
              </div>
          </div>
        </section>

        <section id="team" className="animate-on-scroll">
          <div className="section-header">
            <h2 className="section-title">Development Team</h2>
            <p className="section-subtitle">Meet the innovators behind Smart SK</p>
          </div>
          <div className="team-grid">
              <div className="team-card">
                  <div className="team-avatar">JB</div>
                  <h3 className="team-name">Jeff Aldreich S. Bontuyan</h3>
                  <p className="team-role">Project Manager</p>
              </div>
              <div className="team-card">
                  <div className="team-avatar">LA</div>
                  <h3 className="team-name">Luis Albert A. De Guzman</h3>
                  <p className="team-role">Lead Programmer</p>
              </div>
              <div className="team-card">
                  <div className="team-avatar">RB</div>
                  <h3 className="team-name">Reign Kerstine A. Balagtas</h3>
                  <p className="team-role">System Analyst</p>
              </div>
              <div className="team-card">
                  <div className="team-avatar">YA</div>
                  <h3 className="team-name">Yasmien M. Ando</h3>
                  <p className="team-role">Quality Assurance</p>
              </div>
          </div>
        </section>

        <footer id="contact">
          <div className="footer-content">
            <div className="section-header">
              <h2 className="section-title">Get In Touch</h2>
              <p className="section-subtitle">Ready to transform your SK project monitoring?</p>
            </div>
            <div className="contact-info">
              <div className="contact-item">
                <span>📧</span>
                <span>smartsk2025@gmail.com</span>
              </div>
              <div className="contact-item">
                <span>💼</span>
                <span>linkedin.com/in/smartsk</span>
              </div>
              <div className="contact-item">
                <span>🏫</span>
                <span>STI College Novaliches</span>
              </div>
            </div>
            <p className="copyright">© 2025 Smart SK. Empowering youth governance through technology.</p>
          </div>
        </footer>
      </div>
      <Portal 
        isOpen={isPortalOpen} 
        onClose={() => setIsPortalOpen(false)} 
        onBarangaySelect={handleBarangaySelect} 
      />
      <Login 
        open={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        barangay={selectedBarangay}
      />
    </>
  );
};

export default Portfolio;
