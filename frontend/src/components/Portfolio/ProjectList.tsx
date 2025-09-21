import { useEffect, useState } from 'react';
import logoUrl from'../../assets/logo.gif';
import './ProjectList.css';

interface ProjectPost {
  id: number;
  title: string;
  description: string;
  barangay: string;
  date: string;
  author: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string;
  tags: string[];
  likes: number;
  comments: number;
  category: string;
  status: 'Completed' | 'Ongoing' | 'Upcoming';
}

const ProjectList: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBarangay, setSelectedBarangay] = useState('all');
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const createParticles = () => {
      const particles = document.getElementById('particles');
      if (particles) {
        particles.innerHTML = '';
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

  const projectPosts: ProjectPost[] = [
    {
      id: 1,
      title: "Community Garden Initiative",
      description: "Our barangay launched a community garden project that has transformed an unused lot into a thriving green space. Residents can now grow their own vegetables and learn sustainable farming practices. This initiative has brought our community closer together while promoting food security and environmental awareness.",
      barangay: "Barangay San Bartolome",
      date: "2 days ago",
      author: "SK Chairman Maria Santos",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop",
      tags: ["Environment", "Community", "Sustainability"],
      likes: 156,
      comments: 23,
      category: "environment",
      status: "Completed"
    },
    {
      id: 2,
      title: "Youth Basketball League Finals",
      description: "The culmination of our month-long youth basketball tournament! Watch the highlights from an incredible final game that showcased the talent and sportsmanship of our young athletes. This league has provided a positive outlet for our youth and strengthened community bonds.",
      barangay: "Barangay Nagkaisang Nayon",
      date: "5 days ago",
      author: "SK Sports Coordinator Juan Dela Cruz",
      mediaType: "video",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?w=800&h=600&fit=crop",
      tags: ["Sports", "Youth", "Community"],
      likes: 289,
      comments: 45,
      category: "sports",
      status: "Completed"
    },
    {
      id: 3,
      title: "Digital Learning Center Opening",
      description: "Proud to announce the opening of our new digital learning center! Equipped with modern computers and high-speed internet, this facility will provide free technology education to residents of all ages. We're bridging the digital divide one click at a time.",
      barangay: "Barangay San Bartolome",
      date: "1 week ago",
      author: "SK Education Officer Anna Reyes",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&h=600&fit=crop",
      tags: ["Education", "Technology", "Digital Literacy"],
      likes: 203,
      comments: 31,
      category: "education",
      status: "Ongoing"
    },
    {
      id: 4,
      title: "Tree Planting Drive Success",
      description: "Amazing turnout for our quarterly tree planting drive! Over 200 residents joined us in planting 500 native trees along the riverbank. Together, we're creating a greener future for our children and helping combat climate change one tree at a time.",
      barangay: "Barangay Nagkaisang Nayon",
      date: "2 weeks ago",
      author: "Environmental Officer Luis Garcia",
      mediaType: "video",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop",
      tags: ["Environment", "Climate Action", "Community"],
      likes: 342,
      comments: 67,
      category: "environment",
      status: "Completed"
    },
    {
      id: 5,
      title: "Senior Citizens Health Program",
      description: "Launching our comprehensive health and wellness program for senior citizens! Free medical consultations, exercise classes, and health screenings are now available every Wednesday. Our elderly community members deserve the best care and attention.",
      barangay: "Barangay San Bartolome",
      date: "3 weeks ago",
      author: "Health Coordinator Dr. Rosa Martinez",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=800&h=600&fit=crop",
      tags: ["Healthcare", "Senior Citizens", "Wellness"],
      likes: 187,
      comments: 29,
      category: "health",
      status: "Ongoing"
    },
    {
      id: 6,
      title: "Youth Skills Workshop Series",
      description: "Empowering our youth with essential life skills! This month's workshop series covered entrepreneurship, financial literacy, and leadership development. Watch as our young participants share their learning experiences and future business ideas.",
      barangay: "Barangay Nagkaisang Nayon",
      date: "1 month ago",
      author: "SK Secretary Mark Gonzales",
      mediaType: "video",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop",
      tags: ["Youth Development", "Skills Training", "Education"],
      likes: 278,
      comments: 52,
      category: "education",
      status: "Completed"
    }
  ];

  const categories = [
    { key: 'all', label: 'All Projects' },
    { key: 'environment', label: 'Environment' },
    { key: 'sports', label: 'Sports' },
    { key: 'education', label: 'Education' },
    { key: 'health', label: 'Healthcare' }
  ];

  const barangays = [
    { key: 'all', label: 'All Barangays' },
    { key: 'Barangay San Bartolome', label: 'Barangay San Bartolome' },
    { key: 'Barangay Nagkaisang Nayon', label: 'Barangay Nagkaisang Nayon' }
  ];

  const filteredPosts = projectPosts.filter(post => {
    const categoryMatch = selectedCategory === 'all' || post.category === selectedCategory;
    const barangayMatch = selectedBarangay === 'all' || post.barangay === selectedBarangay;
    return categoryMatch && barangayMatch;
  });

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % filteredPosts.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + filteredPosts.length) % filteredPosts.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const statusColors = {
    'Completed': '#059669',
    'Ongoing': '#2563eb',
    'Upcoming': '#d97706'
  };

  return (
    <div className="project-showcase">
      <style>{`
        :root {
          --primary: #2563eb;
          --secondary: #3498db;
          --bg-primary: #ffffff;
          --bg-secondary: #f8fafc;
          --bg-card: #ffffff;
          --text-primary: #1e293b;
          --text-secondary: #475569;
          --text-muted: #64748b;
          --border: #e2e8f0;
          --border-light: #f1f5f9;
          --success: #059669;
          --warning: #d97706;
          --shadow: rgba(0, 0, 0, 0.07);
          --shadow-lg: rgba(0, 0, 0, 0.1);
        }

        body {
          background-color: var(--bg-primary);
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .project-showcase {
          font-family: 'Inter', sans-serif;
          background: var(--bg-primary);
          color: var(--text-primary);
          line-height: 1.6;
          overflow-x: hidden;
          min-height: 100vh;
        }

        .particles {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 0;
        }

        .particle {
          position: absolute;
          width: 2px;
          height: 2px;
          background: var(--primary);
          border-radius: 50%;
          opacity: 0.6;
          animation: float 20s infinite linear;
        }

        @keyframes float {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
        }

        .project-showcase > * {
          position: relative;
          z-index: 1;
        }

        .showcase-nav {
          position: fixed;
          top: 2rem;
          right: 2rem;
          z-index: 100;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 50px;
          padding: 0.5rem;
          border: 1px solid var(--border);
          box-shadow: 0 10px 30px var(--shadow-lg);
        }

        .nav-links {
          display: flex;
          list-style: none;
          gap: 0.5rem;
          margin: 0;
          padding: 0;
        }

        .nav-links li {
          position: relative;
        }

        .nav-links a, .nav-links button {
          display: block;
          padding: 0.75rem 1.5rem;
          text-decoration: none;
          color: var(--text-secondary);
          border-radius: 25px;
          transition: all 0.3s ease;
          font-weight: 500;
          font-size: 0.9rem;
          border: none;
          background: none;
          cursor: pointer;
          font-family: inherit;
        }

        .nav-links a:hover, .nav-links button:hover {
          background: var(--primary);
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(37, 99, 235, 0.3);
        }

        .showcase-header {
          min-height: 70vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 8rem 2rem 2rem;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.03), rgba(124, 58, 237, 0.03));
        }

        .header-content {
          max-width: 900px;
          animation: fadeInUp 1s ease-out;
        }

        .logo-wrapper {
          margin: 0 auto 2rem;
          animation: pulse 2s infinite;
        }

        .logo-wrapper img {
          width: 80px;
          height: 80px;
          border-radius: 20px;
          box-shadow: 0 15px 30px rgba(37, 99, 235, 0.15);
          border: 1px solid var(--border-light);
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .showcase-title {
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 800;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .showcase-subtitle {
          font-size: clamp(1rem, 2vw, 1.3rem);
          color: var(--text-secondary);
          margin-bottom: 2rem;
          font-weight: 400;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        .showcase-section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem 5rem;
        }

        .filter-section {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          margin-bottom: 3rem;
        }

        .category-filters, .barangay-filters {
          display: flex;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .filter-label {
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 1rem;
          text-align: center;
        }

        .category-btn, .barangay-btn {
          padding: 0.75rem 1.5rem;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          border-radius: 25px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
          font-size: 0.9rem;
        }

        .category-btn:hover, .category-btn.active,
        .barangay-btn:hover, .barangay-btn.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(37, 99, 235, 0.3);
        }

        .slideshow-container {
          position: relative;
          margin-bottom: 3rem;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 40px var(--shadow-lg);
          background: var(--bg-card);
        }

        .slide {
          display: none;
          animation: slideIn 0.5s ease-in-out;
        }

        .slide.active {
          display: block;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .slide-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 500px;
        }

        .slide-media {
          position: relative;
          overflow: hidden;
          background: #000;
        }

        .slide-media img, .slide-media video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .play-button {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 80px;
          height: 80px;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          color: var(--primary);
          transition: all 0.3s ease;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }

        .play-button:hover {
          background: white;
          transform: translate(-50%, -50%) scale(1.1);
        }

        .slide-info {
          padding: 3rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .slide-header {
          margin-bottom: 1.5rem;
        }

        .slide-title {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .slide-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .slide-author {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .slide-date {
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .slide-status {
          padding: 0.25rem 0.75rem;
          border-radius: 15px;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .slide-description {
          color: var(--text-secondary);
          margin-bottom: 1.5rem;
          line-height: 1.7;
          font-size: 1.05rem;
        }

        .slide-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .slide-tag {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.8rem;
          border: 1px solid var(--border-light);
        }

        .slide-engagement {
          display: flex;
          gap: 1.5rem;
          color: var(--text-muted);
        }

        .engagement-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .nav-buttons {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 50px;
          height: 50px;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          color: var(--primary);
          transition: all 0.3s ease;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }

        .nav-buttons:hover {
          background: white;
          transform: translateY(-50%) scale(1.1);
        }

        .prev-btn {
          left: 2rem;
        }

        .next-btn {
          right: 2rem;
        }

        .slide-indicators {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          padding: 2rem;
          background: var(--bg-secondary);
        }

        .indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--border);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .indicator.active {
          background: var(--primary);
          transform: scale(1.2);
        }

        .projects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 2rem;
        }

        .project-card {
          background: var(--bg-card);
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid var(--border);
          transition: all 0.3s ease;
          box-shadow: 0 5px 15px var(--shadow);
          cursor: pointer;
        }

        .project-card:hover {
          transform: translateY(-10px);
          box-shadow: 0 20px 40px rgba(37, 99, 235, 0.15);
          border-color: var(--primary);
        }

        .card-media {
          height: 200px;
          overflow: hidden;
          position: relative;
        }

        .card-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }

        .project-card:hover .card-media img {
          transform: scale(1.05);
        }

        .card-content {
          padding: 1.5rem;
        }

        .card-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .card-description {
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 1rem;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-on-scroll {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.6s ease-out;
        }

        .animate-on-scroll.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .showcase-footer {
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
          padding: 3rem 2rem;
          text-align: center;
        }

        .copyright {
          color: var(--text-muted);
          margin: 0;
        }

        @media (max-width: 768px) {
          .showcase-nav {
            position: static;
            margin: 2rem auto 0;
            max-width: max-content;
            display: block;
          }

          .nav-links {
            flex-direction: row;
            gap: 0.5rem;
            flex-wrap: nowrap;
            justify-content: center;
          }

          .showcase-header {
            min-height: 60vh;
            padding: 6rem 1.5rem 2rem;
          }
          
          .showcase-section {
            padding: 0 1.5rem 4rem;
          }

          .filter-section {
            gap: 1rem;
          }

          .category-filters, .barangay-filters {
            flex-direction: column;
            align-items: center;
          }
          
          .slide-content {
            grid-template-columns: 1fr;
          }
          
          .slide-media {
            height: 300px;
          }
          
          .slide-info {
            padding: 2rem;
          }
          
          .projects-grid {
            grid-template-columns: 1fr;
          }
          
          .nav-buttons {
            width: 40px;
            height: 40px;
          }
          
          .prev-btn {
            left: 1rem;
          }
          
          .next-btn {
            right: 1rem;
          }
        }
      `}</style>

      <div className="particles" id="particles"></div>

      <nav className="showcase-nav">
        <ul className="nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/projects">Projects</a></li>
          <li><a href="/login">Login</a></li>
        </ul>
      </nav>

      <header className="showcase-header">
        <div className="header-content">
          <div className="logo-wrapper">
            <img src= {logoUrl} alt="Smart SK Logo" />
          </div>
          <h1 className="showcase-title">SK Project Showcase</h1>
          <p className="showcase-subtitle">
            Discover the impactful projects and community initiatives from Barangay San Bartolome and Barangay Nagkaisang Nayon. See how our Sangguniang Kabataan is making a difference in our communities.
          </p>
        </div>
      </header>

      <section className="showcase-section">
        <div className="animate-on-scroll">
          <div className="filter-section">
            <div>
              <div className="filter-label">Filter by Barangay</div>
              <div className="barangay-filters">
                {barangays.map((barangay) => (
                  <button
                    key={barangay.key}
                    className={`barangay-btn ${selectedBarangay === barangay.key ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedBarangay(barangay.key);
                      setCurrentSlide(0);
                    }}
                  >
                    {barangay.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="filter-label">Filter by Project Category</div>
              <div className="category-filters">
                {categories.map((category) => (
                  <button
                    key={category.key}
                    className={`category-btn ${selectedCategory === category.key ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCategory(category.key);
                      setCurrentSlide(0);
                    }}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filteredPosts.length > 0 ? (
          <>
            <div className="animate-on-scroll">
              <div className="slideshow-container">
                {filteredPosts.map((post, index) => (
                  <div key={post.id} className={`slide ${index === currentSlide ? 'active' : ''}`}>
                    <div className="slide-content">
                      <div className="slide-media">
                        {post.mediaType === 'video' ? (
                          <>
                            <img src={post.thumbnailUrl} alt={post.title} />
                            <button className="play-button">▶</button>
                          </>
                        ) : (
                          <img src={post.mediaUrl} alt={post.title} />
                        )}
                      </div>
                      <div className="slide-info">
                        <div className="slide-header">
                          <h2 className="slide-title">{post.title}</h2>
                          <div className="slide-meta">
                            <span className="slide-author">{post.author}</span>
                            <span className="slide-date">{post.date}</span>
                            <span 
                              className="slide-status" 
                              style={{ 
                                backgroundColor: statusColors[post.status] + '20',
                                color: statusColors[post.status] 
                              }}
                            >
                              {post.status}
                            </span>
                          </div>
                        </div>
                        <p className="slide-description">{post.description}</p>
                        <div className="slide-tags">
                          {post.tags.map((tag, tagIndex) => (
                            <span key={tagIndex} className="slide-tag">{tag}</span>
                          ))}
                        </div>
                        <div className="slide-engagement">
                          <div className="engagement-item">
                            <span>❤️</span>
                            <span>{post.likes} likes</span>
                          </div>
                          <div className="engagement-item">
                            <span>💬</span>
                            <span>{post.comments} comments</span>
                          </div>
                          <div className="engagement-item">
                            <span>📍</span>
                            <span>{post.barangay}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {filteredPosts.length > 1 && (
                  <>
                    <button className="nav-buttons prev-btn" onClick={prevSlide}>‹</button>
                    <button className="nav-buttons next-btn" onClick={nextSlide}>›</button>
                  </>
                )}
                
                {filteredPosts.length > 1 && (
                  <div className="slide-indicators">
                    {filteredPosts.map((_, index) => (
                      <button
                        key={index}
                        className={`indicator ${index === currentSlide ? 'active' : ''}`}
                        onClick={() => goToSlide(index)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="animate-on-scroll">
              <div className="projects-grid">
                {filteredPosts.map((post) => (
                  <div
                    key={post.id}
                    className="project-card"
                    onClick={() => goToSlide(filteredPosts.indexOf(post))}
                  >
                    <div className="card-media">
                      <img 
                        src={post.mediaType === 'video' ? post.thumbnailUrl : post.mediaUrl} 
                        alt={post.title} 
                      />
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">{post.title}</h3>
                      <p className="card-description">{post.description}</p>
                      <div className="slide-meta">
                        <span className="slide-author">{post.author}</span>
                        <span className="slide-date">{post.date}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="animate-on-scroll" style={{ textAlign: 'center', padding: '4rem 0' }}>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>No projects found</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              No projects match the current filter criteria. Try selecting different options or check back later for updates.
            </p>
          </div>
        )}
      </section>

      <footer className="showcase-footer">
        <div className="footer-content">
          <p className="copyright">© 2025 Smart SK Community Showcase. Celebrating youth-led community development in our barangays.</p>
        </div>
      </footer>
    </div>
  );
};

export default ProjectList;