/* ==========================================================================
   DIESEL DRIVE - CORE APP CONTROLLER (EXPRESS API & SQLITE SYNC & WHATSAPP)
   ========================================================================== */

// Backend API Base URL:
// Automatically uses relative path '' when on localhost, and the live production URL when on GitHub Pages.
// Note: Update 'https://dieseldrive-api.onrender.com' with your actual backend URL once deployed on Render/Railway!
const API_BASE_URL = window.API_BASE_URL || (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://dieseldrive.onrender.com'
);

// 1. App State
const state = {
  currentRoute: '/',
  booking: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    serviceType: '',
    preferredDate: '',
    preferredTime: '',
    additionalNotes: '',
    attachedFileName: ''
  },
  bookingStep: 1,
  bookingSubmitted: false,
  submittedBookingId: null,
  submittedBookingData: null,
  submittedWaUrl: '',
  
  // Service Estimator state
  estimator: {
    vehicleType: 'suv',
    serviceType: 'routine',
    isScanning: false
  },
  
  // Testimonials list fetched from database
  reviews: [],
  activeReviewIdx: 0,

  // Admin Dashboard state
  adminTab: 'bookings', // 'bookings' | 'reviews' | 'invite' | 'security'
  adminSearchQuery: '',
  adminStatusFilter: 'all', // 'all' | 'Pending' | 'Confirmed' | 'Completed'
  bookingsList: [],
  adminReviewsList: [],
  currentAdminUsername: 'admin',
  generatedInviteUrl: '',
  inviteName: '',
  inviteVehicle: '',
  
  // Review Submission Invite validation state
  reviewToken: '',
  reviewInviteStatus: 'loading', // 'loading' | 'valid' | 'used' | 'invalid'
  reviewInviteName: '',
  reviewInviteVehicle: '',
  
  // Avatar upload Base64 state
  reviewAvatarBase64: '',
  selectedRating: 5
};

// Estimator Matrix
const estimatorMatrix = {
  vehicles: {
    car: { label: 'Passenger Car (Petrol/Diesel)', multiplier: 1.0 },
    suv: { label: '4WD / Off-Road SUV (Prado, Pajero, Surf)', multiplier: 1.25 },
    fleet: { label: 'Commercial Van / Light Truck (Transit, Canter)', multiplier: 1.45 }
  },
  services: {
    diagnostic: { label: 'Electronic Diagnostic Scan', min: 110, max: 170, code: 'OBD2_SCAN_0x3E' },
    routine: { label: 'Routine Lubrication Servicing', min: 220, max: 360, code: 'MAINT_RESET_0x1A' },
    repair: { label: 'Mechanical System Repair', min: 400, max: 850, code: 'GEAR_CHECK_0x4F' },
    tuning: { label: 'Performance ECU Remapping', min: 600, max: 1150, code: 'ECU_FLASH_0x8C' }
  }
};

// Base path detection: supports custom domain (root '/') and GitHub project subpath ('/dieseldrive')
const BASE_PATH = window.location.pathname.startsWith('/dieseldrive') ? '/dieseldrive' : '';

// 2. SEO Configurations (9 Routes)
const seoConfig = {
  '/': {
    title: 'Diesel Drive | Expert 4WD, SUV & Diesel Repair Auckland',
    description: 'Expert diesel mechanic services in Auckland. Rebuilding engines, high-tech electronic diagnostics, routine maintenance, and ECU remapping tuning since 1991.'
  },
  '/services': {
    title: 'Specialist Mechanical Services & FAQ | Diesel Drive Auckland',
    description: 'Dealer-level engine diagnostics, mechanical repairs, custom performance dyno tuning, 4x4 lift setups, and commercial fleet schedules in Otahuhu, Auckland.'
  },
  '/tuning': {
    title: 'ECU Remapping & Performance Tuning | Diesel Drive Auckland',
    description: 'Optimize your diesel vehicle performance. Custom ECU mapping, Dyno testing, Stage 1/2 profiles, DPF/EGR solutions for better towing power and fuel economy.'
  },
  '/4x4': {
    title: '4x4 Lift Kits, Diffs & Drivetrain Upgrades | Diesel Drive Auckland',
    description: 'Specialist off-road 4WD modifications. Rebuilding differentials, fitting suspension lift kits, heavy-duty clutches, and lockers for Hilux, Patrol, Prado.'
  },
  '/contact': {
    title: 'Contact Us & Workshop Location | Diesel Drive Auckland',
    description: 'Visit our mechanic shop in Otahuhu, Auckland. Get directions, business hours, telephone contact, and fill out a direct workshop query form.'
  },
  '/booking': {
    title: 'Book a Mechanic Service Online | Diesel Drive Auckland',
    description: 'Easily book your vehicle diagnostics, tune-ups, or repairs online. Fill in details and attach dashboard logs for priority check booking.'
  },
  '/admin-login': {
    title: 'Owner Portal Login | Diesel Drive',
    description: 'Authorized administrative access gate for the Diesel Drive workshop owner.'
  },
  '/admin': {
    title: 'Workshop Owner Dashboard | Diesel Drive',
    description: 'Owner management panel for booking requests, review verification, and client invite link generation.'
  },
  '/submit-review': {
    title: 'Leave a Service Review | Diesel Drive',
    description: 'We value your feedback. Leave a service rating and comment for your vehicle repairs.'
  },
  '/404': {
    title: '404 - Page Not Found | Diesel Drive Auckland',
    description: 'The requested page or diagnostic route could not be found. Return to Diesel Drive Auckland homepage or browse our specialist mechanical services.'
  }
};

// 3. SPA Router (10 Routes)
const routes = {
  '/': renderHome,
  '/services': renderServices,
  '/tuning': renderTuning,
  '/4x4': render4x4,
  '/contact': renderContact,
  '/booking': renderBooking,
  '/admin-login': renderAdminLogin,
  '/admin': renderAdminDashboard,
  '/submit-review': renderSubmitReview,
  '/404': renderNotFound
};

function getCurrentRoutePath() {
  // If legacy hash is accessed (e.g. #/admin-login or #/submit-review?token=xxx), migrate to clean URL
  if (window.location.hash && window.location.hash.startsWith('#/')) {
    const legacyPath = window.location.hash.slice(1);
    const target = (BASE_PATH || '') + legacyPath;
    window.history.replaceState(null, '', target);
  }

  let pathname = window.location.pathname;
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    pathname = pathname.slice(BASE_PATH.length);
  }
  if (!pathname || pathname === '' || pathname === '/index.html') {
    pathname = '/';
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
}

function navigateTo(path) {
  if (!path) path = '/';
  if (path.startsWith('#/')) {
    path = path.slice(1);
  }
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  const fullTarget = (BASE_PATH || '') + path;
  if (window.location.pathname + window.location.search !== fullTarget) {
    window.history.pushState(null, '', fullTarget);
  }
  router();
}

function router() {
  const path = getCurrentRoutePath();
  state.currentRoute = path;
  
  // Manage layout isolation (hide public header/footer/floating CTA on standalone login)
  if (path === '/admin-login') {
    document.body.classList.add('standalone-auth-active');
    document.body.classList.remove('admin-mode-active');
  } else if (path === '/admin') {
    document.body.classList.remove('standalone-auth-active');
    document.body.classList.add('admin-mode-active');
  } else {
    document.body.classList.remove('standalone-auth-active');
    document.body.classList.remove('admin-mode-active');
  }
  
  // Set active link in headers
  updateNavLinks();
  
  // Dynamic Page Transition Loader Shell
  const appContainer = document.getElementById('app-content');
  appContainer.innerHTML = `
    <div class="loader-container">
      <div class="loader"></div>
    </div>
  `;
  
  window.scrollTo({ top: 0, behavior: 'instant' });
  
  // Update SEO Meta
  updateSEO(path);

  // Close mobile navigation drawer if open
  const mobileNav = document.getElementById('mobile-nav-id');
  const menuIcon = document.getElementById('menu-icon-id');
  if (mobileNav && mobileNav.classList.contains('open')) {
    mobileNav.classList.remove('open');
    if (menuIcon) menuIcon.setAttribute('data-lucide', 'menu');
  }

  // Route matching
  if (path === '/') {
    fetchReviews().then(() => {
      renderPage(path, appContainer);
    });
  } else if (path === '/admin') {
    if (!sessionStorage.getItem('adminToken')) {
      navigateTo('/admin-login');
      return;
    }
    fetchAdminData().then(() => {
      renderPage(path, appContainer);
    });
  } else if (path === '/submit-review') {
    validateReviewToken().then(() => {
      renderPage(path, appContainer);
    });
  } else if (routes[path]) {
    renderPage(path, appContainer);
  } else {
    // Unrecognized route -> 404
    renderNotFound(appContainer);
    if (window.lucide) window.lucide.createIcons();
    setupScrollAnimations();
  }
}

function renderPage(path, appContainer) {
  const renderFunc = routes[path] || renderNotFound;
  renderFunc(appContainer);
  
  // Re-initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
  
  // Set up scroll animations (Intersection Observer)
  setupScrollAnimations();
}

function updateNavLinks() {
  const activeClassRoute = state.currentRoute;
  document.querySelectorAll('#desktop-nav-id .nav-link').forEach(link => {
    let href = link.getAttribute('href') || '';
    if (href.startsWith('#')) href = href.slice(1);
    if (href === activeClassRoute) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  document.querySelectorAll('#mobile-nav-id .mobile-nav-link').forEach(link => {
    let href = link.getAttribute('href') || '';
    if (href.startsWith('#')) href = href.slice(1);
    if (href === activeClassRoute) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

function updateSEO(path) {
  const seo = seoConfig[path] || seoConfig['/404'] || seoConfig['/'];
  document.title = seo.title;
  
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = seo.description;
}

// 4. Global Event Listeners
window.addEventListener('scroll', () => {
  const header = document.getElementById('main-header-id');
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

document.getElementById('mobile-menu-btn-id').addEventListener('click', () => {
  const mobileNav = document.getElementById('mobile-nav-id');
  const menuIcon = document.getElementById('menu-icon-id');
  
  const isOpen = mobileNav.classList.toggle('open');
  
  if (isOpen) {
    menuIcon.setAttribute('data-lucide', 'x');
  } else {
    menuIcon.setAttribute('data-lucide', 'menu');
  }
  
  if (window.lucide) window.lucide.createIcons();
});

document.getElementById('copyright-year').textContent = new Date().getFullYear();

// Toast alerts helper
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container-id');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconName = type === 'success' ? 'check-circle' : 'alert-triangle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();
  
  setTimeout(() => toast.classList.add('show'), 50);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}

// Intersection Observer for scroll animations with Stagger Delays
function setupScrollAnimations() {
  const staggerGrids = document.querySelectorAll('.stagger-container');
  staggerGrids.forEach(grid => {
    const animChildren = grid.querySelectorAll('.slide-in-left, .slide-in-right, .zoom-in-up');
    animChildren.forEach((child, idx) => {
      child.style.transitionDelay = `${idx * 120}ms`;
    });
  });

  const animateElements = document.querySelectorAll('.slide-in-left, .slide-in-right, .zoom-in-up');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('appear');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.05,
    rootMargin: '0px 0px -20px 0px'
  });
  
  animateElements.forEach(el => observer.observe(el));
}

// ==========================================================================
// DATABASE API FETCH SYNCING
// ==========================================================================

async function fetchReviews() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/reviews`);
    if (res.ok) {
      state.reviews = await res.json();
    }
  } catch (err) {
    console.error('Error fetching reviews:', err);
    state.reviews = [];
  }
}

async function fetchAdminData() {
  try {
    const resB = await fetch(`${API_BASE_URL}/api/bookings`);
    if (resB.ok) state.bookingsList = await resB.json();
    
    const resR = await fetch(`${API_BASE_URL}/api/reviews`);
    if (resR.ok) state.adminReviewsList = await resR.json();

    const resU = await fetch(`${API_BASE_URL}/api/admin/current-user`);
    if (resU.ok) {
      const uData = await resU.json();
      state.currentAdminUsername = uData.username || 'admin';
    }
  } catch (err) {
    console.error('Error fetching admin data:', err);
  }
}

async function validateReviewToken() {
  state.reviewToken = '';
  state.reviewInviteStatus = 'invalid';
  state.reviewInviteName = '';
  state.reviewInviteVehicle = '';

  let searchParams = new URLSearchParams(window.location.search);
  let token = searchParams.get('token');

  // Fallback to legacy hash params if present
  if (!token && window.location.hash.includes('?')) {
    const hashQuery = window.location.hash.substring(window.location.hash.indexOf('?'));
    token = new URLSearchParams(hashQuery).get('token');
  }

  if (!token) {
    state.reviewInviteStatus = 'invalid';
    return;
  }

  state.reviewToken = token;
  state.reviewInviteStatus = 'loading';

  try {
    const res = await fetch(`${API_BASE_URL}/api/invites/${token}`);
    if (res.ok) {
      const invite = await res.json();
      if (invite.status === 'Pending') {
        state.reviewInviteStatus = 'valid';
        state.reviewInviteName = invite.name;
        state.reviewInviteVehicle = invite.vehicle;
      } else {
        state.reviewInviteStatus = 'used';
      }
    } else {
      state.reviewInviteStatus = 'invalid';
    }
  } catch (err) {
    console.error('Token validation failed:', err);
    state.reviewInviteStatus = 'invalid';
  }
}

// ==========================================================================
// UPGRADED COMPONENT LOGIC
// ==========================================================================

// --- Service Estimator Calculations with Active Scanning Animation ---
window.updateEstimator = function(key, val) {
  state.estimator[key] = val;
  triggerEstimatorScanAnimation();
};

function triggerEstimatorScanAnimation() {
  if (state.estimator.isScanning) return;
  state.estimator.isScanning = true;
  
  const priceDisplay = document.getElementById('estimator-price-val');
  const codesDisplay = document.getElementById('estimator-codes-val');
  const ledDot = document.getElementById('estimator-led-dot');
  
  if (priceDisplay && codesDisplay) {
    priceDisplay.textContent = 'SCANNING...';
    priceDisplay.classList.add('loading-bracket');
    
    codesDisplay.textContent = 'RUNNING DIAGNOSTIC TEST ROUTINES...\nCONNECTING TO BUS CONTROLLERS...';
    codesDisplay.classList.add('scanning');
  }
  
  if (ledDot) {
    ledDot.style.backgroundColor = '#FF9900';
    ledDot.style.boxShadow = '0 0 10px #FF9900';
  }

  setTimeout(() => {
    const vehicle = estimatorMatrix.vehicles[state.estimator.vehicleType];
    const service = estimatorMatrix.services[state.estimator.serviceType];
    
    if (vehicle && service) {
      const minPrice = Math.round(service.min * vehicle.multiplier);
      const maxPrice = Math.round(service.max * vehicle.multiplier);
      
      if (priceDisplay && codesDisplay) {
        priceDisplay.textContent = `$${minPrice} - $${maxPrice} NZD`;
        priceDisplay.classList.remove('loading-bracket');
        
        codesDisplay.textContent = `BUS_STATUS: OK\nMODULE_ID: ${service.code}\nCAR_TYPE: ${state.estimator.vehicleType.toUpperCase()}\nSCAN_RESULT: PASS. NO ENGINE CODES TRIGGERED.`;
        codesDisplay.classList.remove('scanning');
      }
      
      if (ledDot) {
        ledDot.style.backgroundColor = '#00FF66';
        ledDot.style.boxShadow = '0 0 10px #00FF66';
      }
    }
    state.estimator.isScanning = false;
  }, 1000);
}

// --- Testimonials Interactive Swapping Drawer ---
window.swapTestimonial = function(idx) {
  state.activeReviewIdx = idx;
  const review = state.reviews[idx];
  if (!review) return;
  
  const panel = document.getElementById('active-testimonial-panel');
  if (panel) {
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
      let starsHtml = '';
      for (let s = 1; s <= 5; s++) {
        starsHtml += `<i data-lucide="star" style="width: 16px; height: 16px; margin-right: 2px; ${s <= review.rating ? 'fill: #f59e0b; color: #f59e0b;' : 'color: #cbd5e1;'}"></i>`;
      }
      
      panel.innerHTML = `
        <p class="active-quote-text">"${review.quote}"</p>
        <div style="margin-bottom: 1.5rem; display: flex; align-items: center;">${starsHtml}</div>
        <div class="active-user-meta">
          <img src="${review.avatar || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Client ${review.name}" class="active-avatar">
          <div>
            <div class="active-name">${review.name}</div>
            <div class="active-vehicle">${review.vehicle}</div>
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
      panel.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }, 200);
  }
  
  document.querySelectorAll('.selector-drawer-card').forEach((card, cIdx) => {
    if (cIdx === idx) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
};

// --- Drag & Drop File Upload Mocking ---
window.handleDragOver = function(e) {
  e.preventDefault();
  const box = document.getElementById('upload-box-id');
  if (box) box.classList.add('dragover');
};

window.handleDragLeave = function(e) {
  e.preventDefault();
  const box = document.getElementById('upload-box-id');
  if (box) box.classList.remove('dragover');
};

window.handleDrop = function(e) {
  e.preventDefault();
  const box = document.getElementById('upload-box-id');
  if (box) box.classList.remove('dragover');
  
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    saveUploadedFile(e.dataTransfer.files[0].name);
  }
};

window.triggerFileSelect = function() {
  const fileInput = document.getElementById('mock-file-input');
  if (fileInput) fileInput.click();
};

window.handleFileSelectChange = function(inputEl) {
  if (inputEl.files && inputEl.files.length > 0) {
    saveUploadedFile(inputEl.files[0].name);
  }
};

function saveUploadedFile(name) {
  state.booking.attachedFileName = name;
  const container = document.getElementById('upload-wrapper-id');
  if (container) {
    container.innerHTML = `
      <div class="uploaded-file-tag">
        <i data-lucide="file-text"></i>
        <span>${name}</span>
        <i data-lucide="x" onclick="removeAttachedFile(event)" style="color: #ef4444; margin-left: 0.5rem;"></i>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
  showToast('File Attached', `File "${name}" is attached to your service booking.`, 'success');
  updateLiveSummary();
}

window.removeAttachedFile = function(e) {
  e.stopPropagation();
  state.booking.attachedFileName = '';
  const container = document.getElementById('upload-wrapper-id');
  if (container) {
    container.innerHTML = `
      <div class="upload-box" id="upload-box-id" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)" onclick="triggerFileSelect()">
        <i data-lucide="upload-cloud"></i>
        <span>Drag & Drop OBD2 diagnostics logs or dashboard photos here</span>
        <span class="upload-box-sub">Or click to select files from device</span>
        <input type="file" id="mock-file-input" style="display: none;" onchange="handleFileSelectChange(this)" accept="image/*,.txt,.pdf,.csv">
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
  updateLiveSummary();
};

// Set Booking Service presets
window.setServicePreference = function(serviceType) {
  state.booking.serviceType = serviceType;
  state.bookingStep = 1;
};

// FAQ accordion toggles
window.toggleFaq = function(buttonEl) {
  const faqItem = buttonEl.closest('.faq-item');
  const answer = faqItem.querySelector('.faq-answer');
  const isActive = faqItem.classList.contains('active');
  
  document.querySelectorAll('.faq-item').forEach(item => {
    item.classList.remove('active');
    item.querySelector('.faq-answer').style.maxHeight = null;
  });
  
  if (!isActive) {
    faqItem.classList.add('active');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }
};


// ==========================================================================
// TEMPLATE COMPILERS (Upgraded Layouts & 9 Pages)
// ==========================================================================

// --- HOME PAGE VIEW (Overhauled Asymmetrical Grids & DB reviews sync) ---
function renderHome(container) {
  let quoteHtml = '';
  let drawerItemsHtml = '';
  
  if (state.reviews.length > 0) {
    const review = state.reviews[state.activeReviewIdx] || state.reviews[0];
    
    let starsHtml = '';
    for (let s = 1; s <= 5; s++) {
      starsHtml += `<i data-lucide="star" style="width: 16px; height: 16px; margin-right: 2px; ${s <= review.rating ? 'fill: #f59e0b; color: #f59e0b;' : 'color: #cbd5e1;'}"></i>`;
    }

    quoteHtml = `
      <p class="active-quote-text">"${review.quote}"</p>
      <div style="margin-bottom: 1.5rem; display: flex; align-items: center;">${starsHtml}</div>
      <div class="active-user-meta">
        <img src="${review.avatar || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Client ${review.name}" class="active-avatar">
        <div>
          <div class="active-name">${review.name}</div>
          <div class="active-vehicle">${review.vehicle}</div>
        </div>
      </div>
    `;
    
    state.reviews.forEach((rev, idx) => {
      drawerItemsHtml += `
        <div class="selector-drawer-card ${idx === state.activeReviewIdx ? 'active' : ''}" onclick="swapTestimonial(${idx})">
          <div class="drawer-user-info">
            <img src="${rev.avatar || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar ${rev.name}" class="drawer-avatar">
            <div>
              <div class="drawer-name">${rev.name}</div>
              <div class="drawer-vehicle">${rev.vehicle}</div>
            </div>
          </div>
          <div class="drawer-go-btn"><i data-lucide="chevron-right"></i></div>
        </div>
      `;
    });
  } else {
    quoteHtml = `<p class="active-quote-text">No client reviews submitted yet. Invite clients from the owner admin panel!</p>`;
    drawerItemsHtml = `<div>Reviews list empty.</div>`;
  }

  container.innerHTML = `
    <!-- Split Layout Editorial Hero -->
    <section class="hero-section-bg">
      <div class="editorial-hero-grid">
        
        <!-- Left: Massive Typography -->
        <div class="hero-text-side slide-in-left">
          <div class="hero-badge"><i data-lucide="award"></i> Certified Specialists since 1991</div>
          <h1>Engine Tuning & <br><span class="accent-text">Heavy 4WD Repairs</span></h1>
          <p>Premium electronic diagnostic scanner runs, torque tuning, DPF/EGR cleaning, and complete diesel engine rebuilds. We specialize in Nissan Patrol, Toyota Hilux, Prado, and Mitsubishi Pajero models.</p>
          <div class="hero-actions">
            <a href="/booking" class="btn btn-primary" title="Book service via WhatsApp"><i data-lucide="calendar"></i> Book Online Now</a>
            <a href="/services" class="btn btn-secondary" title="View mechanical services">Explore Our Services</a>
          </div>
        </div>

        <!-- Right: Overlapping Layered Collage -->
        <div class="collage-side slide-in-right">
          <div class="collage-wrapper">
            <div class="collage-img collage-img-1">
              <img src="images/hero_4x4.png" alt="Diesel Toyota 4x4 crawling offroad New Zealand">
            </div>
            <div class="collage-img collage-img-2">
              <img src="images/service_tuning.png" alt="Tuning truck on dyno rollers">
            </div>
            <div class="collage-img collage-img-3">
              <img src="images/service_diagnostics.png" alt="OBD2 code scanner check">
            </div>
            <div class="floating-accent-badge badge-position-1 floating">021 0258 3793</div>
            <div class="floating-accent-badge badge-position-2 floating">OTAHUHU, AKL</div>
          </div>
        </div>

      </div>
    </section>

    <!-- Upgraded Component: Diagnostic Tool Cost Estimator -->
    <section class="section bg-darker-section">
      <div class="container">
        
        <div class="section-header zoom-in-up">
          <span class="section-title-badge">OBD2 Simulator Interface</span>
          <h2 class="section-title">Diagnostic Service Cost Calculator</h2>
          <p class="section-desc">Select vehicle specs and desired repair modules below. Our virtual diagnostic scanner links to Bus controller modules to calculate active price brackets.</p>
        </div>

        <div class="dashboard-estimator-card zoom-in-up">
          <div class="dashboard-grid">
            
            <!-- Controls Left -->
            <div class="dashboard-controls">
              
              <div class="control-item">
                <label for="est-vehicle-type"><i data-lucide="truck"></i> Vehicle Configuration</label>
                <select id="est-vehicle-type" class="dashboard-select" onchange="updateEstimator('vehicleType', this.value)">
                  <option value="car">Passenger Car (Sedan, Hatchback, Crossover)</option>
                  <option value="suv" selected>4WD / Off-Road SUV (Hilux, Patrol, Prado)</option>
                  <option value="fleet">Light Commercial Van & Truck (Transit, Hino)</option>
                </select>
              </div>

              <div class="control-item">
                <label for="est-service-type"><i data-lucide="cpu"></i> Target System Module</label>
                <select id="est-service-type" class="dashboard-select" onchange="updateEstimator('serviceType', this.value)">
                  <option value="diagnostic">Electronic Diagnostic Scan & Log Check</option>
                  <option value="routine" selected>Routine Lubrication Service & Filters</option>
                  <option value="repair">Mechanical Systems Repair (Diffs, Suspension)</option>
                  <option value="tuning">Performance ECU Remap & Dyno Profiles</option>
                </select>
              </div>

            </div>

            <!-- Virtual Diagnostic Terminal Screen Right -->
            <div class="scanner-screen-wrapper">
              <div class="screen-header-bar">
                <span>DIAGNOSTIC CONTROLLER v4.1</span>
                <span style="display: flex; align-items: center; gap: 0.5rem;">
                  <span>ECU_LINK</span>
                  <div class="scan-status-dot" id="estimator-led-dot"></div>
                </span>
              </div>
              
              <div class="screen-sys-codes" id="estimator-codes-val">
                BUS_STATUS: OK<br>MODULE_ID: MAINT_RESET_0x1A<br>CAR_TYPE: SUV<br>SCAN_RESULT: PASS. NO ACTIVE FAULT CODES FOUND.
              </div>

              <div class="screen-price-display">
                <div class="screen-price-label">Price Bracket Estimate</div>
                <div class="screen-price-bracket" id="estimator-price-val">$275 - $450 NZD</div>
              </div>
            </div>

          </div>
          
          <div style="text-align: center; margin-top: 3rem;">
            <a href="/booking" class="btn btn-primary" title="Book this estimated service"><i data-lucide="calendar"></i> Book Service with this Estimate</a>
          </div>
        </div>

      </div>
    </section>

    <!-- Brain & Brawn Service Timelines -->
    <section class="section">
      <div class="container">
        
        <div class="section-header zoom-in-up">
          <span class="section-title-badge">Our Focus</span>
          <h2 class="section-title">Specialist Capability Columns</h2>
          <p class="section-desc">Our Auckland facility splits services into specialized categories to deliver precise mechanical results.</p>
        </div>

        <div class="timeline-section-row stagger-container">
          
          <!-- Column 1: Brains (Electronics & Remaps) -->
          <div class="timeline-column">
            <h3 class="timeline-column-heading"><i data-lucide="cpu"></i> Brains (Electronics & Remapping)</h3>
            
            <div class="timeline-card-asym slide-in-left" data-number="01">
              <div class="timeline-card-asym-info">
                <h3>OBD2 Diagnostic Checks</h3>
                <p>Equipped with state-of-the-art diagnostic code scanning systems, we pinpoint sensor faults, exhaust restrictions, and pressure drop errors.</p>
                <a href="/services" class="learn-more-link" title="Explore Diagnostics">Explore Scans <i data-lucide="arrow-right"></i></a>
              </div>
            </div>

            <div class="timeline-card-asym slide-in-left" data-number="02" style="margin-top: 1rem;">
              <div class="timeline-card-asym-info">
                <h3>Performance ECU Tuning</h3>
                <p>Reprogram fuel rail pressure curves, boost schedules, and torque maps safely to unlock power for off-road crawls or heavy towing.</p>
                <a href="/tuning" class="learn-more-link" title="Explore Tuning Page">Explore Tuning <i data-lucide="arrow-right"></i></a>
              </div>
            </div>

          </div>

          <!-- Column 2: Brawn (Mechanical & Overhauls) -->
          <div class="timeline-column" style="margin-top: 3rem;">
            <h3 class="timeline-column-heading"><i data-lucide="settings"></i> Brawn (Gears & Machining)</h3>
            
            <div class="timeline-card-asym slide-in-right" data-number="03">
              <div class="timeline-card-asym-info">
                <h3>4x4 Off-Road Upgrades</h3>
                <p>Installation of heavy-duty suspension lift kits, differential lockers, wheel hubs, and custom accessory fittings for extreme mud prep.</p>
                <a href="/4x4" class="learn-more-link" title="Explore 4x4 Specialist Page">Explore 4x4 Upgrades <i data-lucide="arrow-right"></i></a>
              </div>
            </div>

            <div class="timeline-card-asym slide-in-right" data-number="04" style="margin-top: 1rem;">
              <div class="timeline-card-asym-info">
                <h3>Total Engine Rebuilds</h3>
                <p>Complete block cleaning, crankshaft grinds, head surfacing, piston ring replacements, and compression calibrations.</p>
                <a href="/services" class="learn-more-link" title="Explore Engine Machining">Explore Engine Rebuilds <i data-lucide="arrow-right"></i></a>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>

    <!-- Upgraded Component: Staggered Interactive Testimonials Drawer -->
    <section class="section bg-darker-section">
      <div class="container">
        
        <div class="section-header zoom-in-up">
          <span class="section-title-badge">Client Reviews</span>
          <h2 class="section-title">Verified Customer Reviews</h2>
          <p class="section-desc">Click on client records inside the drawer to swap the focal quote testimonial with sliding animations.</p>
        </div>

        <div class="asym-testimonials-wrapper">
          
          <!-- Focal Quote Left -->
          <div class="testimonial-active-panel slide-in-left" id="active-testimonial-panel">
            ${quoteHtml}
          </div>

          <!-- Drawer Right -->
          <div class="testimonials-selector-drawer slide-in-right stagger-container">
            ${drawerItemsHtml}
          </div>

        </div>

      </div>
    </section>

    <!-- Action Banner -->
    <section class="action-banner">
      <div class="container zoom-in-up">
        <h2>Restore Your Diesel Engine's Peak Potential</h2>
        <p>Book your mechanical check or dyno tuning run now. Our team will contact you directly on WhatsApp to coordinate slot presets.</p>
        <div class="action-buttons">
          <a href="/booking" class="btn btn-primary" title="Book Online"><i data-lucide="calendar"></i> Book Online Now</a>
          <a href="tel:+642102583793" class="btn btn-secondary" title="Call Us"><i data-lucide="phone"></i> Call 021 0258 3793</a>
        </div>
      </div>
    </section>
  `;
}

// --- SERVICES & FAQ VIEW ---
function renderServices(container) {
  container.innerHTML = `
    <!-- Page Hero -->
    <section class="page-hero">
      <div class="container">
        <h1 class="page-hero-title">Specialist Mechanical Services</h1>
        <p class="page-hero-desc">Explore our custom diagnostic, tuning, suspension, and engine machining services tailored for petrol & diesel vehicles in Otahuhu, Auckland.</p>
      </div>
    </section>

    <!-- Detailed Rows -->
    <section class="section">
      <div class="container services-list-container">
        
        <!-- Row 1: Diagnostics -->
        <div class="service-row animate-on-scroll">
          <div class="service-row-info">
            <h2>Diesel Engine Diagnostics</h2>
            <div class="service-divider"></div>
            <p>Our workshop is equipped with the latest electronic scan-tools to read real-time engine parameter data, locate high-pressure pump faults, check throttle body responses, and clear fault codes safely.</p>
            <div class="service-features-grid">
              <div class="service-feature"><i data-lucide="check"></i> ECU Code Fault Scanning</div>
              <div class="service-feature"><i data-lucide="check"></i> High-Pressure Injector Logging</div>
              <div class="service-feature"><i data-lucide="check"></i> Compression Leak checks</div>
              <div class="service-feature"><i data-lucide="check"></i> Turbocharger Boost Analysis</div>
            </div>
            <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Diagnostic')" title="Book diagnostic scan service"><i data-lucide="calendar"></i> Schedule Diagnostic Scan</a>
          </div>
          <div class="service-row-img-col">
            <div class="service-row-img">
              <img src="images/service_diagnostics.png" alt="Mechanic plugging OBD2 code scanner into SUV engine bay">
            </div>
          </div>
        </div>

        <!-- Row 2: Maintenance -->
        <div class="service-row animate-on-scroll">
          <div class="service-row-info">
            <h2>Routine Filter Maintenance</h2>
            <div class="service-divider"></div>
            <p>We replace oil and filters matching manufacturer guidelines strictly to keep your warranty valid. Our technicians inspect belts, coolants, brakes, and chassis lubrication at every scheduled mileage block.</p>
            <div class="service-features-grid">
              <div class="service-feature"><i data-lucide="check"></i> Premium Oils & Factory Filters</div>
              <div class="service-feature"><i data-lucide="check"></i> Dual Fuel Filters Replacements</div>
              <div class="service-feature"><i data-lucide="check"></i> Belt & Chain tension checks</div>
              <div class="service-feature"><i data-lucide="check"></i> Antifreeze Cooling Flush</div>
            </div>
            <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Regular Maintenance')" title="Book routine filter maintenance"><i data-lucide="calendar"></i> Schedule Filter Maintenance</a>
          </div>
          <div class="service-row-img-col">
            <div class="service-row-img">
              <img src="images/service_maintenance.png" alt="Black SUV raised on lift inside clean mechanical shop">
            </div>
          </div>
        </div>

        <!-- Row 3: Tuning -->
        <div class="service-row animate-on-scroll">
          <div class="service-row-info">
            <h2>Performance ECU Remapping</h2>
            <div class="service-divider"></div>
            <p>Get better fuel efficiency and torque mapping for heavy towing. We configure custom parameters safely to prevent high exhaust gas temperatures and turbo wear while expanding engine potential.</p>
            <div class="service-features-grid">
              <div class="service-feature"><i data-lucide="check"></i> Custom Towing ECU Maps</div>
              <div class="service-feature"><i data-lucide="check"></i> Dyno Performance Checks</div>
              <div class="service-feature"><i data-lucide="check"></i> Improved Fuel Efficiency Maps</div>
              <div class="service-feature"><i data-lucide="check"></i> EGR/DPF Clean Services</div>
            </div>
            <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Performance Upgrade')" title="Book custom performance tuning"><i data-lucide="calendar"></i> Schedule Tuning Check</a>
          </div>
          <div class="service-row-img-col">
            <div class="service-row-img">
              <img src="images/service_tuning.png" alt="4x4 truck secured on chassis dynamometer dyno rollers for tuning">
            </div>
          </div>
        </div>

        <!-- Row 4: 4x4 Specialist -->
        <div class="service-row animate-on-scroll">
          <div class="service-row-info">
            <h2>4WD & SUV Repairs</h2>
            <div class="service-divider"></div>
            <p>Specialized drivetrain repair for off-road models. We overhaul transfer cases, rebuild worn front/rear differentials, adjust wheel bearings, and install suspension lift kits.</p>
            <div class="service-features-grid">
              <div class="service-feature"><i data-lucide="check"></i> Differential Overhauls</div>
              <div class="service-feature"><i data-lucide="check"></i> Heavy-Duty Suspension Kits</div>
              <div class="service-feature"><i data-lucide="check"></i> Hub & Bearing Adjustments</div>
              <div class="service-feature"><i data-lucide="check"></i> Heavy-Duty Offroad Clutch</div>
            </div>
            <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Repair')" title="Book differential and 4x4 repairs"><i data-lucide="calendar"></i> Schedule 4WD Repair</a>
          </div>
          <div class="service-row-img-col">
            <div class="service-row-img">
              <img src="images/service_4x4_repairs.png" alt="Under chassis details showing red 4x4 coil suspension and muddy wheel">
            </div>
          </div>
        </div>

        <!-- Row 5: Fleet Care -->
        <div class="service-row animate-on-scroll">
          <div class="service-row-info">
            <h2>Commercial Fleet Care</h2>
            <div class="service-divider"></div>
            <p>Minimize courier or transport fleet downtime. We provide corporate billing, rapid log-book maintenance scheduling, and priority emergency repairs to keep your service vans running.</p>
            <div class="service-features-grid">
              <div class="service-feature"><i data-lucide="check"></i> Priority Booking Schedules</div>
              <div class="service-feature"><i data-lucide="check"></i> Safety Pre-Check Loggings</div>
              <div class="service-feature"><i data-lucide="check"></i> Braking & Suspension checks</div>
              <div class="service-feature"><i data-lucide="check"></i> Multi-vehicle Priority Checks</div>
            </div>
            <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Regular Maintenance')" title="Book fleet prioritry inspection"><i data-lucide="calendar"></i> Schedule Fleet Inspection</a>
          </div>
          <div class="service-row-img-col">
            <div class="service-row-img">
              <img src="images/service_fleet.png" alt="Fleet of commercial vans parked outside building at dusk">
            </div>
          </div>
        </div>

        <!-- Row 6: Rebuilds -->
        <div class="service-row animate-on-scroll">
          <div class="service-row-info">
            <h2>Complete Engine Rebuilds</h2>
            <div class="service-divider"></div>
            <p>For high-mileage or failed blocks, our engineering partners bore cylinders, grind crankshaft journals, machine head surfaces, and reassemble blocks to standard specs.</p>
            <div class="service-features-grid">
              <div class="service-feature"><i data-lucide="check"></i> Block Re-Boring & Sleeving</div>
              <div class="service-feature"><i data-lucide="check"></i> Head Crack Checks & Machining</div>
              <div class="service-feature"><i data-lucide="check"></i> Valve & Guide replacements</div>
              <div class="service-feature"><i data-lucide="check"></i> Bearing journals sizing</div>
            </div>
            <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Repair')" title="Book block overhaul consult"><i data-lucide="calendar"></i> Schedule Rebuild Consult</a>
          </div>
          <div class="service-row-img-col">
            <div class="service-row-img">
              <img src="images/service_engine_rebuild.png" alt="Clean diesel engine block on metallic workshop stand">
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- FAQ Accordions -->
    <section class="section bg-darker-section">
      <div class="container">
        <div class="section-header animate-on-scroll">
          <span class="section-title-badge">FAQ</span>
          <h2 class="section-title">Specialist Servicing FAQ</h2>
          <p class="section-desc">Get answers to standard questions about warranty validity, diesel intervals, and diagnostics.</p>
        </div>
        
        <div class="faq-accordion animate-on-scroll">
          
          <div class="faq-item">
            <button class="faq-question" onclick="toggleFaq(this)">
              <span>How often should I service my diesel vehicle?</span>
              <i data-lucide="chevron-down"></i>
            </button>
            <div class="faq-answer">
              <div class="faq-answer-inner">
                Most modern passenger diesel vehicles require servicing every 10,000 km, or every 6 months (whichever comes first). However, older engines, off-road 4x4s, and heavy commercial vehicles should undergo lubrication services every 5,000 km to protect the high-pressure fuel pumps and turbochargers.
              </div>
            </div>
          </div>

          <div class="faq-item">
            <button class="faq-question" onclick="toggleFaq(this)">
              <span>What are the signs that my diesel engine needs diagnostic attention?</span>
              <i data-lucide="chevron-down"></i>
            </button>
            <div class="faq-answer">
              <div class="faq-answer-inner">
                Watch for dark black or blue smoke from the tailpipe, sudden loss of power during acceleration, rough idling or knocking noises, hard starting when cold, and dashboard check engine indicators. Identifying fuel injector leaks early protects your pistons from severe damage.
              </div>
            </div>
          </div>

          <div class="faq-item">
            <button class="faq-question" onclick="toggleFaq(this)">
              <span>Do you work on all diesel vehicle makes and models?</span>
              <i data-lucide="chevron-down"></i>
            </button>
            <div class="faq-answer">
              <div class="faq-answer-inner">
                Yes. Our workshops are specialized in Toyota (Hilux, Land Cruiser, Prado), Nissan (Patrol, Navara), Mitsubishi (Pajero, Triton), Isuzu (D-Max, Bighorn), Ford (Ranger), Mazda, Holden, and light European commercial diesel vans.
              </div>
            </div>
          </div>

          <div class="faq-item">
            <button class="faq-question" onclick="toggleFaq(this)">
              <span>Do you offer a warranty on your repair services?</span>
              <i data-lucide="chevron-down"></i>
            </button>
            <div class="faq-answer">
              <div class="faq-answer-inner">
                Absolutely. All our mechanical repair works are backed by a comprehensive 12-month or 20,000 km parts and labor warranty (whichever comes first). We use premium OEM matching components to ensure reliable operation.
              </div>
            </div>
          </div>

          <div class="faq-item">
            <button class="faq-question" onclick="toggleFaq(this)">
              <span>Will servicing my vehicle at your workshop void my factory warranty?</span>
              <i data-lucide="chevron-down"></i>
            </button>
            <div class="faq-answer">
              <div class="faq-answer-inner">
                No. In New Zealand, consumer protection regulations ensure that as long as the workshop follows manufacturer servicing standards and uses OEM or equivalent parts, your new-vehicle warranty remains fully valid.
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  `;
}

// --- NEW PAGE 1: TUNING & PERFORMANCE VIEW ---
function renderTuning(container) {
  container.innerHTML = `
    <!-- Page Hero -->
    <section class="page-hero">
      <div class="container">
        <h1 class="page-hero-title">Performance ECU Remapping</h1>
        <p class="page-hero-desc">Optimize fuel efficiency, increase throttle response, and configure massive torque parameters for safe towing and heavy cargo loads.</p>
      </div>
    </section>

    <!-- Tuning Split Grid -->
    <section class="section">
      <div class="container split-section">
        <div class="split-content animate-on-scroll">
          <div class="tuning-hero-badge">Stage 1 & Stage 2 Maps</div>
          <h2>Custom ECU Parameters Calibration</h2>
          <p>We do not use standard generic flash maps. Our software calibrations are customized specifically to your vehicle make, mileage, and drivetrain configuration. We optimize fuel pressure ratios, turbocharger boost curve timings, and torque limiters while maintaining safe exhaust gas temperatures (EGTs).</p>
          <ul class="feature-list">
            <li class="feature-item"><i data-lucide="zap"></i> +20% to +35% Horsepower</li>
            <li class="feature-item"><i data-lucide="settings"></i> Improved Torque for Towing</li>
            <li class="feature-item"><i data-lucide="droplet"></i> Fuel Savings up to 1.5L/100km</li>
            <li class="feature-item"><i data-lucide="activity"></i> Custom Dynamometer Verifications</li>
          </ul>
          <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Performance Upgrade')" style="margin-top: 2rem;"><i data-lucide="calendar"></i> Book ECU Tuning Session</a>
        </div>
        <div class="split-image animate-on-scroll">
          <img src="images/service_tuning.png" alt="Diesel truck undergoing performance ECU remapping on dyno rollers">
        </div>
      </div>
    </section>

    <!-- Dedicated Tuning Info Cards -->
    <section class="section bg-darker-section">
      <div class="container">
        <div class="section-header animate-on-scroll">
          <span class="section-title-badge">ECU Upgrades</span>
          <h2 class="section-title">Common Tuning Profiles</h2>
          <p class="section-desc">Choose a calibration profile that matches your vehicle's specific operational requirements.</p>
        </div>

        <div class="features-grid-3 stagger-container">
          
          <div class="glass-card features-grid-3-card slide-in-left">
            <div class="service-icon-box"><i data-lucide="shield-alert"></i></div>
            <h3>Heavy Towing Profile</h3>
            <p>Provides massive low-end torque curves to make towing heavy boats or trailers effortless. Smoothens acceleration ramp-up and lowers engine strain during hill climbs.</p>
          </div>

          <div class="glass-card features-grid-3-card zoom-in-up">
            <div class="service-icon-box"><i data-lucide="compass"></i></div>
            <h3>4x4 Off-Road Profile</h3>
            <p>Configures a highly linear throttle map for fine low-speed pedal control over rock crawls or muddy ruts, preventing wheel spin and enhancing engine cooling cycles.</p>
          </div>

          <div class="glass-card features-grid-3-card slide-in-right">
            <div class="service-icon-box"><i data-lucide="leaf"></i></div>
            <h3>Eco-Drive Profile</h3>
            <p>Optimizes diesel spray timings and turbo pressure coordinates to maximize combustion efficiency. Recommended for commercial fleet delivery vans and transporters.</p>
          </div>

        </div>
      </div>
    </section>
  `;
}

// --- NEW PAGE 2: 4X4 SPECIALIST VIEW ---
function render4x4(container) {
  container.innerHTML = `
    <!-- Page Hero -->
    <section class="page-hero">
      <div class="container">
        <h1 class="page-hero-title">4WD Specialist & Off-Road Upgrades</h1>
        <p class="page-hero-desc">Heavy duty suspension lift kits, differential overhauls, manual hub conversion locks, and performance drivetrain repairs for Auckland's 4x4 community.</p>
      </div>
    </section>

    <!-- 4x4 Split Grid -->
    <section class="section">
      <div class="container split-section">
        <div class="split-image animate-on-scroll">
          <img src="images/service_4x4_repairs.png" alt="Under chassis of off-road vehicle detailing red coil suspension upgrades">
        </div>
        <div class="split-content animate-on-scroll">
          <div class="tuning-hero-badge">Specialist 4WD Gear</div>
          <h2>Drivetrain & Suspension Overhauls</h2>
          <p>We are off-road enthusiasts who understand the structural stress placed on 4x4 mechanics during mud crawls, river crossings, and heavy towing. We install premium suspension upgrades and perform differential ratio rebuilding to fit larger tires and restore drivability.</p>
          <ul class="feature-list">
            <li class="feature-item"><i data-lucide="shield"></i> Coil & Shock Lift Kit Installs</li>
            <li class="feature-item"><i data-lucide="settings"></i> Rebuilding Worn Differentials</li>
            <li class="feature-item"><i data-lucide="link"></i> Heavy-Duty Drivetrain Parts</li>
            <li class="feature-item"><i data-lucide="shield-check"></i> Transfer Case Overhauling</li>
          </ul>
          <a href="/booking" class="btn btn-primary" onclick="setServicePreference('Repair')" style="margin-top: 2rem;"><i data-lucide="calendar"></i> Book 4x4 Upgrades</a>
        </div>
      </div>
    </section>

    <!-- Specific Drivetrain Gear Blocks -->
    <section class="section bg-darker-section">
      <div class="container">
        <div class="section-header animate-on-scroll">
          <span class="section-title-badge">Hardware Specialists</span>
          <h2 class="section-title">Upgrade Specifications</h2>
          <p class="section-desc">Our mechanical crew handles specific upgrades to build rugged 4WD rigs.</p>
        </div>

        <div class="gear-spec-block animate-on-scroll">
          <ul class="gear-spec-list">
            
            <li class="gear-spec-item">
              <i data-lucide="shield-check"></i>
              <div>
                <h4>Differential Gear Changes</h4>
                <p>Fit larger off-road tires without losing acceleration. We match ring-and-pinion gear ratios to keep your engine in its optimal RPM power band.</p>
              </div>
            </li>

            <li class="gear-spec-item">
              <i data-lucide="wrench"></i>
              <div>
                <h4>Heavy-Duty Clutches</h4>
                <p>Upgrade to heavy-duty single or dual-mass clutch systems to handle increased engine torque and prevent slipping under heavy loads.</p>
              </div>
            </li>

          </ul>

          <ul class="gear-spec-list">
            
            <li class="gear-spec-item">
              <i data-lucide="anchor"></i>
              <div>
                <h4>Differential Lockers Fitting</h4>
                <p>Unlock ultimate off-road traction. We fit pneumatic (air) and electromagnetic locker systems into front and rear axles.</p>
              </div>
            </li>

            <li class="gear-spec-item">
              <i data-lucide="settings"></i>
              <div>
                <h4>Manual Hub Conversions</h4>
                <p>Replace weak electronic hubs with heavy-duty manual locking hubs, reducing drag on the front drivetrain and saving fuel on highways.</p>
              </div>
            </li>

          </ul>
        </div>
      </div>
    </section>
  `;
}

// --- NEW PAGE 3: CONTACT & LOCATION VIEW ---
function renderContact(container) {
  container.innerHTML = `
    <!-- Page Hero -->
    <section class="page-hero">
      <div class="container">
        <h1 class="page-hero-title">Contact Us & Location</h1>
        <p class="page-hero-desc">Visit our specialist mechanical garage in Otahuhu, Auckland. Get in touch directly via telephone, email, or fill out a query.</p>
      </div>
    </section>

    <!-- Contact & Map Split Layout -->
    <section class="section">
      <div class="container contact-layout">
        
        <!-- Left: Quick Contact Form -->
        <div class="glass-card animate-on-scroll">
          <h3 style="font-size: 1.4rem; margin-bottom: 1.5rem; text-transform: uppercase;">Direct Workshop Query</h3>
          <form onsubmit="handleDirectContactSubmit(event)" style="display: flex; flex-direction: column; gap: 1.5rem;">
            <div class="form-group">
              <label for="contact-name">Full Name <span class="required">*</span></label>
              <input type="text" id="contact-name" class="form-input" placeholder="e.g. John Doe" required>
            </div>
            <div class="form-group">
              <label for="contact-email">Email Address <span class="required">*</span></label>
              <input type="email" id="contact-email" class="form-input" placeholder="e.g. john@example.com" required>
            </div>
            <div class="form-group">
              <label for="contact-phone">Phone Number</label>
              <input type="tel" id="contact-phone" class="form-input" placeholder="e.g. 021 0258 3793">
            </div>
            <div class="form-group">
              <label for="contact-message">Your Message / Query <span class="required">*</span></label>
              <textarea id="contact-message" class="form-input" rows="4" placeholder="Describe what repair, tuning spec, or service you are querying about..." required></textarea>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top: 1rem;"><i data-lucide="send"></i> Send Direct Query</button>
          </form>
        </div>

        <!-- Right: Maps & Contact Cards -->
        <div class="sidebar-booking-info animate-on-scroll">
          
          <div class="map-wrapper">
            <iframe 
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2836.7570417726487!2d174.84221131557088!3d-36.94470007967965!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6d0d4eccb87ca7bb%3A0xe54e3895e69e0618!2s31c%20Atkinson%20Avenue%2C%20%C5%8Ct%C4%81huhu%2C%20Auckland%201062!5e0!3m2!1sen!2snz!4v1655000000000!5m2!1sen!2snz" 
              allowfullscreen="" 
              loading="lazy" 
              referrerpolicy="no-referrer-when-downgrade">
            </iframe>
          </div>

          <div class="glass-card info-box">
            <h4>Location & Hours</h4>
            <ul class="info-box-list">
              <li>
                <i data-lucide="map-pin"></i>
                <span>31c Atkinson Avenue, Ōtāhuhu, Auckland, 1062, NZ</span>
              </li>
              <li>
                <i data-lucide="phone"></i>
                <a href="tel:+642102583793" style="font-weight: 700; color: var(--primary);">021 0258 3793</a>
              </li>
              <li>
                <i data-lucide="mail"></i>
                <a href="mailto:z.ali0067@gmail.com">z.ali0067@gmail.com</a>
              </li>
              <li>
                <i data-lucide="clock"></i>
                <span>Monday - Friday: 8:00 AM - 5:00 PM<br>Saturday: By Appointment</span>
              </li>
            </ul>
          </div>

        </div>

      </div>
    </section>
  `;
}

window.handleDirectContactSubmit = function(event) {
  event.preventDefault();
  const name = document.getElementById('contact-name').value;
  const email = document.getElementById('contact-email').value;
  const phone = document.getElementById('contact-phone').value;
  const msg = document.getElementById('contact-message').value;

  const waMessage = `*DIESEL DRIVE DIRECT CONTACT QUERY*\n\n*Name*: ${name}\n*Email*: ${email}\n*Phone*: ${phone || 'Not provided'}\n\n*Message*:\n${msg}`;
  const waUrl = `https://wa.me/642102583793?text=${encodeURIComponent(waMessage)}`;
  
  showToast('Connecting WhatsApp', 'Redirecting query to workshop WhatsApp...', 'success');
  
  setTimeout(() => {
    window.open(waUrl, '_blank');
    event.target.reset();
  }, 1000);
};


// --- ONLINE BOOKING VIEW ---
function renderBooking(container) {
  container.innerHTML = `
    <!-- Header -->
    <section class="page-hero">
      <div class="container">
        <h1 class="page-hero-title">Book A Service Appointment</h1>
        <p class="page-hero-desc">Complete your vehicle info below. Fill in details and click submit to generate your booking request.</p>
      </div>
    </section>

    <!-- Layout -->
    <section class="section booking-section">
      <div class="container booking-layout">
        
        <!-- Booking Form Left -->
        <div class="glass-card" id="booking-main-card">
          
          <!-- Stepper Trackers (4 Steps) -->
          <div class="booking-steps-tracker">
            <div class="booking-progress-bar" id="progress-bar-id"></div>
            
            <div class="step-indicator active" id="step-ind-1">
              <div class="step-num">1</div>
              <div class="step-label">Contact</div>
            </div>
            
            <div class="step-indicator" id="step-ind-2">
              <div class="step-num">2</div>
              <div class="step-label">Vehicle</div>
            </div>
            
            <div class="step-indicator" id="step-ind-3">
              <div class="step-num">3</div>
              <div class="step-label">Service</div>
            </div>

            <div class="step-indicator" id="step-ind-4">
              <div class="step-num"><i data-lucide="check" style="width: 16px; height: 16px;"></i></div>
              <div class="step-label">Success</div>
            </div>
          </div>

          <!-- Forms -->
          <form id="booking-form" onsubmit="handleBookingSubmit(event)">
            
            <!-- Step 1: Personal Details -->
            <div class="form-step active" id="form-step-1">
              <h3 style="font-size: 1.4rem; margin-bottom: 1.5rem; text-transform: uppercase;">Step 1: Contact Information</h3>
              <div class="form-grid">
                <div class="form-group">
                  <label for="first-name">First Name <span class="required">*</span></label>
                  <input type="text" id="first-name" class="form-input" placeholder="e.g. John" value="${state.booking.firstName}" oninput="updateField('firstName', this.value)" required>
                </div>
                <div class="form-group">
                  <label for="last-name">Last Name <span class="required">*</span></label>
                  <input type="text" id="last-name" class="form-input" placeholder="e.g. Smith" value="${state.booking.lastName}" oninput="updateField('lastName', this.value)" required>
                </div>
                <div class="form-group">
                  <label for="email-address">Email Address <span class="required">*</span></label>
                  <input type="email" id="email-address" class="form-input" placeholder="e.g. john@example.com" value="${state.booking.email}" oninput="updateField('email', this.value)" required>
                </div>
                <div class="form-group">
                  <label for="phone-number">Mobile / Phone <span class="required">*</span></label>
                  <input type="tel" id="phone-number" class="form-input" placeholder="e.g. 021 0258 3793" value="${state.booking.phone}" oninput="updateField('phone', this.value)" required>
                </div>
              </div>
              <div class="form-actions">
                <div></div>
                <button type="button" class="btn btn-primary" onclick="goToStep(2)">Next: Vehicle Details <i data-lucide="arrow-right"></i></button>
              </div>
            </div>

            <!-- Step 2: Vehicle Details -->
            <div class="form-step" id="form-step-2">
              <h3 style="font-size: 1.4rem; margin-bottom: 1.5rem; text-transform: uppercase;">Step 2: Vehicle details</h3>
              <div class="form-grid-3">
                <div class="form-group">
                  <label for="vehicle-make">Make</label>
                  <input type="text" id="vehicle-make" class="form-input" placeholder="e.g. Toyota" value="${state.booking.vehicleMake}" oninput="updateField('vehicleMake', this.value)">
                </div>
                <div class="form-group">
                  <label for="vehicle-model">Model</label>
                  <input type="text" id="vehicle-model" class="form-input" placeholder="e.g. Hilux" value="${state.booking.vehicleModel}" oninput="updateField('vehicleModel', this.value)">
                </div>
                <div class="form-group">
                  <label for="vehicle-year">Year</label>
                  <input type="number" id="vehicle-year" class="form-input" placeholder="2020" min="1950" max="2027" value="${state.booking.vehicleYear}" oninput="updateField('vehicleYear', this.value)">
                </div>
              </div>
              
              <!-- Drag & Drop Uploader -->
              <div class="form-group" style="margin-bottom: 2.5rem;">
                <label>Attach Diagnostic Log / Dash Photo (Optional)</label>
                <div id="upload-wrapper-id">
                  ${state.booking.attachedFileName ? `
                    <div class="uploaded-file-tag">
                      <i data-lucide="file-text"></i>
                      <span>${state.booking.attachedFileName}</span>
                      <i data-lucide="x" onclick="removeAttachedFile(event)" style="color: #ef4444; margin-left: 0.5rem;"></i>
                    </div>
                  ` : `
                    <div class="upload-box" id="upload-box-id" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)" onclick="triggerFileSelect()">
                      <i data-lucide="upload-cloud"></i>
                      <span>Drag & Drop OBD2 diagnostics logs or dashboard photos here</span>
                      <span class="upload-box-sub">Or click to select files from device</span>
                      <input type="file" id="mock-file-input" style="display: none;" onchange="handleFileSelectChange(this)" accept="image/*,.txt,.pdf,.csv">
                    </div>
                  `}
                </div>
              </div>

              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="goToStep(1)"><i data-lucide="arrow-left" style="margin-right: 0.6rem; margin-left: 0;"></i> Back</button>
                <button type="button" class="btn btn-primary" onclick="goToStep(3)">Next: Service Options <i data-lucide="arrow-right"></i></button>
              </div>
            </div>

            <!-- Step 3: Service Settings -->
            <div class="form-step" id="form-step-3">
              <h3 style="font-size: 1.4rem; margin-bottom: 1.5rem; text-transform: uppercase;">Step 3: Service & Scheduling</h3>
              <div class="form-grid">
                <div class="form-group">
                  <label for="service-type">Requested Service</label>
                  <select id="service-type" class="form-input" onchange="updateField('serviceType', this.value)">
                    <option value="" ${state.booking.serviceType === '' ? 'selected' : ''}>-- Choose Service --</option>
                    <option value="Regular Maintenance" ${state.booking.serviceType === 'Regular Maintenance' ? 'selected' : ''}>Routine Lubrication Maintenance</option>
                    <option value="Diagnostic" ${state.booking.serviceType === 'Diagnostic' ? 'selected' : ''}>Engine Diagnostic Code Scan</option>
                    <option value="Repair" ${state.booking.serviceType === 'Repair' ? 'selected' : ''}>Mechanical Engine / 4x4 Repairs</option>
                    <option value="Performance Upgrade" ${state.booking.serviceType === 'Performance Upgrade' ? 'selected' : ''}>ECU Remap & Dyno Tuning</option>
                    <option value="Other" ${state.booking.serviceType === 'Other' ? 'selected' : ''}>Other Issues (Specify Below)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="preferred-date">Preferred Date</label>
                  <input type="date" id="preferred-date" class="form-input" value="${state.booking.preferredDate}" onchange="updateField('preferredDate', this.value)">
                </div>
                <div class="form-group">
                  <label for="preferred-time">Preferred Arrival Time</label>
                  <select id="preferred-time" class="form-input" onchange="updateField('preferredTime', this.value)">
                    <option value="" ${state.booking.preferredTime === '' ? 'selected' : ''}>-- Choose Time Window --</option>
                    <option value="Morning (8:00 AM - 12:00 PM)" ${state.booking.preferredTime === 'Morning (8:00 AM - 12:00 PM)' ? 'selected' : ''}>Morning (8:00 AM - 12:00 PM)</option>
                    <option value="Afternoon (12:00 PM - 5:00 PM)" ${state.booking.preferredTime === 'Afternoon (12:00 PM - 5:00 PM)' ? 'selected' : ''}>Afternoon (12:00 PM - 5:00 PM)</option>
                  </select>
                </div>
                <div class="form-group form-group-full">
                  <label for="additional-notes">Additional Details / Problems</label>
                  <textarea id="additional-notes" class="form-input" rows="4" placeholder="Describe any engine light codes, specific problems, or tuning targets..." oninput="updateField('additionalNotes', this.value)">${state.booking.additionalNotes}</textarea>
                </div>
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="goToStep(2)"><i data-lucide="arrow-left" style="margin-right: 0.6rem; margin-left: 0;"></i> Back</button>
                <button type="submit" class="btn btn-primary" id="submit-booking-btn"><i data-lucide="calendar"></i> Book Now</button>
              </div>
            </div>

            <!-- Step 4: Submission Success (In-Form 4th Section) -->
            <div class="form-step" id="form-step-4" style="text-align: center; padding: 1.5rem 0;">
              
              <!-- Verified Success Icon -->
              <div style="width: 72px; height: 72px; border-radius: 50%; background-color: #ECFDF5; border: 3px solid #10B981; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1.4rem; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.25);">
                <i data-lucide="check" style="width: 38px; height: 38px; color: #10B981; stroke-width: 3.5;"></i>
              </div>

              <h3 style="font-size: 1.85rem; text-transform: uppercase; margin-bottom: 0.5rem; color: var(--carbon-dark);">Booking Request Generated!</h3>
              <p style="font-size: 1.02rem; color: var(--text-gray); margin-bottom: 1.8rem; line-height: 1.6;">
                Your appointment request <strong id="step4-ref-id" style="color: var(--crimson);">#DD-1001</strong> has been successfully logged in our workshop database.
              </p>

              <!-- In-Form Summary Box -->
              <div style="background-color: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.4rem 1.8rem; text-align: left; margin-bottom: 1.8rem;">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 0.65rem; margin-bottom: 0.65rem; font-size: 0.92rem;">
                  <span style="font-size: 0.8rem; text-transform: uppercase; font-weight: 800; color: var(--text-muted);">Client</span>
                  <span style="font-weight: 800; color: var(--carbon-dark);" id="step4-client-val">Not Set</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 0.65rem; margin-bottom: 0.65rem; font-size: 0.92rem;">
                  <span style="font-size: 0.8rem; text-transform: uppercase; font-weight: 800; color: var(--text-muted);">Vehicle</span>
                  <span style="font-weight: 800; color: var(--carbon-dark);" id="step4-vehicle-val">Not Set</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 0.65rem; margin-bottom: 0.65rem; font-size: 0.92rem;">
                  <span style="font-size: 0.8rem; text-transform: uppercase; font-weight: 800; color: var(--text-muted);">Service</span>
                  <span style="font-weight: 800; color: var(--crimson);" id="step4-service-val">Standard Workshop Service</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.92rem;">
                  <span style="font-size: 0.8rem; text-transform: uppercase; font-weight: 800; color: var(--text-muted);">Schedule</span>
                  <span style="font-weight: 800; color: var(--carbon-dark);" id="step4-schedule-val">Flexible</span>
                </div>
              </div>

              <!-- Outline WhatsApp Action Button -->
              <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                <a href="#" id="step4-wa-btn" target="_blank" class="btn btn-outline-whatsapp" style="width: 100%; max-width: 380px; justify-content: center; font-size: 1.05rem; padding: 0.95rem 1.5rem; text-decoration: none;">
                  <i data-lucide="message-circle" style="width: 20px; height: 20px;"></i> Send on WhatsApp
                </a>

                <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; margin-top: 0.5rem;">
                  <button type="button" class="btn btn-secondary" onclick="resetBookingForm()">
                    <i data-lucide="plus-circle"></i> Create Another Booking
                  </button>
                  <a href="/" class="btn btn-outline-primary">
                    <i data-lucide="home"></i> Return Home
                  </a>
                </div>
              </div>

            </div>

          </form>
        </div>

        <!-- Sidebar Summary Panel -->
        <div class="sidebar-booking-info">
          
          <div class="glass-card info-box" id="booking-summary-box">
            <h4 style="color: var(--text-white);">Real-time Booking Summary</h4>
            <div class="summary-details">
              <div class="summary-row">
                <span class="summary-label">Contact:</span>
                <span class="summary-val" id="summary-owner-val">Not Entered</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Vehicle Make/Model:</span>
                <span class="summary-val" id="summary-vehicle-val">Not Entered</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Selected Service:</span>
                <span class="summary-val" id="summary-service-val">Not Selected</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">File Attached:</span>
                <span class="summary-val" id="summary-file-val" style="color: var(--primary);">None</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Schedule Date:</span>
                <span class="summary-val" id="summary-date-val">Not Set</span>
              </div>
            </div>
          </div>

          <!-- Shop Box Details -->
          <div class="glass-card info-box">
            <h4 style="color: var(--text-white);">Workshop Details</h4>
            <ul class="info-box-list">
              <li>
                <i data-lucide="map-pin"></i>
                <span>31c Atkinson Avenue,<br>Ōtāhuhu, Auckland, 1062, NZ</span>
              </li>
              <li>
                <i data-lucide="phone"></i>
                <a href="tel:+642102583793">021 0258 3793</a>
              </li>
              <li>
                <i data-lucide="clock"></i>
                <span>Mon - Fri: 8 AM - 5 PM<br>Saturday: By Appointment</span>
              </li>
              <li>
                <i data-lucide="shield"></i>
                <span>All repair work includes a 1-year or 20k KM parts warranty.</span>
              </li>
            </ul>
          </div>

        </div>

      </div>
    </section>
  `;
  
  const dateInput = document.getElementById('preferred-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }
  
  updateLiveSummary();
  goToStep(state.bookingStep, true);
}

// Booking fields synchronizers
window.updateField = function(fieldName, value) {
  state.booking[fieldName] = value;
  updateLiveSummary();
};

function updateLiveSummary() {
  const ownerVal = document.getElementById('summary-owner-val');
  const vehicleVal = document.getElementById('summary-vehicle-val');
  const serviceVal = document.getElementById('summary-service-val');
  const fileVal = document.getElementById('summary-file-val');
  const dateVal = document.getElementById('summary-date-val');
  
  if (!ownerVal) return;
  
  const fullName = `${state.booking.firstName} ${state.booking.lastName}`.trim();
  ownerVal.textContent = fullName ? fullName : 'Not Entered';
  
  let vehicle = `${state.booking.vehicleMake} ${state.booking.vehicleModel}`.trim();
  if (state.booking.vehicleYear) {
    vehicle += ` (${state.booking.vehicleYear})`;
  }
  vehicleVal.textContent = vehicle.trim() ? vehicle : 'Not Entered';
  
  serviceVal.textContent = state.booking.serviceType ? state.booking.serviceType : 'Not Selected';
  fileVal.textContent = state.booking.attachedFileName ? state.booking.attachedFileName : 'None';
  
  if (state.booking.preferredDate) {
    let dateStr = state.booking.preferredDate;
    if (state.booking.preferredTime) {
      const isMorning = state.booking.preferredTime.includes('Morning');
      dateStr += isMorning ? ' (Morning)' : ' (Afternoon)';
    }
    dateVal.textContent = dateStr;
  } else {
    dateVal.textContent = 'Not Set';
  }
}

window.goToStep = function(stepNum, forceDirectDraw = false) {
  if (stepNum === 2 && state.bookingStep === 1 && !forceDirectDraw) {
    if (!state.booking.firstName || !state.booking.lastName || !state.booking.email || !state.booking.phone) {
      highlightEmptyField('first-name');
      highlightEmptyField('last-name');
      highlightEmptyField('email-address');
      highlightEmptyField('phone-number');
      return;
    }
    if (!validateEmail(state.booking.email)) {
      highlightEmptyField('email-address');
      return;
    }
  }

  state.bookingStep = stepNum;

  const steps = [1, 2, 3, 4];
  steps.forEach(num => {
    const formElement = document.getElementById(`form-step-${num}`);
    const indicatorElement = document.getElementById(`step-ind-${num}`);
    
    if (formElement && indicatorElement) {
      if (num === stepNum) {
        formElement.classList.add('active');
        indicatorElement.className = 'step-indicator active';
      } else {
        formElement.classList.remove('active');
        if (num < stepNum) {
          indicatorElement.className = 'step-indicator completed';
        } else {
          indicatorElement.className = 'step-indicator';
        }
      }
    }
  });

  const progressLine = document.getElementById('progress-bar-id');
  if (progressLine) {
    const percentage = ((stepNum - 1) / 3) * 100;
    progressLine.style.width = `${percentage}%`;
  }
  
  if (window.lucide) window.lucide.createIcons();
};

function highlightEmptyField(id) {
  const el = document.getElementById(id);
  if (el && !el.value.trim()) {
    el.style.borderColor = '#4a535d';
    setTimeout(() => {
      el.style.borderColor = '';
    }, 3000);
  }
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Booking Submit Syncs to Express API SQLite + Activates In-Form 4th Step Confirmation
window.handleBookingSubmit = async function(event) {
  event.preventDefault();
  
  const submitBtn = document.getElementById('submit-booking-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="loader" style="width: 14px; height: 14px; border-width: 2px; margin-right: 0.5rem; display: inline-block;"></div> Booking...`;
  }

  // 1. Submit record to SQLite Database API
  let bookingId = null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.booking)
    });
    
    if (res.ok) {
      const data = await res.json();
      bookingId = data.id;
    }
  } catch (err) {
    console.error('DB submit error:', err);
  }

  // 2. Generate WhatsApp message link
  const waMessage = `*DIESEL DRIVE SERVICE BOOKING REQUEST*\n` +
                    `---------------------------------------\n` +
                    `*Owner*: ${state.booking.firstName} ${state.booking.lastName}\n` +
                    `*Phone*: ${state.booking.phone}\n` +
                    `*Email*: ${state.booking.email}\n` +
                    `*Vehicle*: ${state.booking.vehicleMake || 'Not Specified'} ${state.booking.vehicleModel || ''} (${state.booking.vehicleYear || 'Not Specified'})\n` +
                    `*Service*: ${state.booking.serviceType || 'Not Selected'}\n` +
                    `*Schedule*: ${state.booking.preferredDate || 'Not Selected'} - ${state.booking.preferredTime || ''}\n` +
                    `*Attached File*: ${state.booking.attachedFileName || 'None'}\n\n` +
                    `*Client Notes*:\n${state.booking.additionalNotes || 'No additional notes provided.'}`;

  const waUrl = `https://wa.me/642102583793?text=${encodeURIComponent(waMessage)}`;

  // 3. Update Step 4 in-form values
  const refDisplay = document.getElementById('step4-ref-id');
  if (refDisplay) {
    refDisplay.textContent = bookingId ? `#DD-${1000 + bookingId}` : '#DD-1001';
  }
  const clientDisplay = document.getElementById('step4-client-val');
  if (clientDisplay) {
    clientDisplay.textContent = `${state.booking.firstName} ${state.booking.lastName} (${state.booking.phone})`;
  }
  const vehicleDisplay = document.getElementById('step4-vehicle-val');
  if (vehicleDisplay) {
    vehicleDisplay.textContent = `${state.booking.vehicleMake || 'N/A'} ${state.booking.vehicleModel || ''} ${state.booking.vehicleYear ? `(${state.booking.vehicleYear})` : ''}`.trim();
  }
  const serviceDisplay = document.getElementById('step4-service-val');
  if (serviceDisplay) {
    serviceDisplay.textContent = state.booking.serviceType || 'Standard Workshop Service';
  }
  const scheduleDisplay = document.getElementById('step4-schedule-val');
  if (scheduleDisplay) {
    scheduleDisplay.textContent = `${state.booking.preferredDate || 'Flexible'} ${state.booking.preferredTime ? `(${state.booking.preferredTime})` : ''}`;
  }
  const waBtn = document.getElementById('step4-wa-btn');
  if (waBtn) {
    waBtn.href = waUrl;
  }

  // 4. Smoothly advance stepper to 4th section (Confirmation)
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="calendar"></i> Book Now`;
  }
  goToStep(4, true);

  const mainCard = document.getElementById('booking-main-card');
  if (mainCard) {
    mainCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.resetBookingForm = function() {
  state.booking = {
    firstName: '', lastName: '', email: '', phone: '',
    vehicleMake: '', vehicleModel: '', vehicleYear: '',
    serviceType: '', preferredDate: '', preferredTime: '',
    additionalNotes: '', attachedFileName: ''
  };
  
  const form = document.getElementById('booking-form');
  if (form) form.reset();
  
  updateLiveSummary();
  goToStep(1, true);
  
  const mainCard = document.getElementById('booking-main-card');
  if (mainCard) {
    mainCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// ==========================================================================
// 404 NOT FOUND VIEW
// ==========================================================================
function renderNotFound(container) {
  container.innerHTML = `
    <div class="not-found-wrapper">
      <div class="container not-found-container zoom-in-up">
        
        <div class="not-found-badge">
          <i data-lucide="alert-triangle"></i>
          <span>DIAGNOSTIC FAULT: 0x404_PAGE_NOT_FOUND</span>
        </div>

        <div class="not-found-code-display">
          <span class="not-found-digits">4<span class="accent-text">0</span>4</span>
        </div>

        <h1 class="not-found-title">Engine Stall &bull; Route Not Found</h1>

        <p class="not-found-desc">
          Looks like you've gone off-grid. The mechanical spec sheet, diagnostic tool, or page you were trying to access doesn't exist, has been relocated, or is undergoing workshop maintenance.
        </p>

        <div class="not-found-actions">
          <a href="/" class="btn btn-primary" title="Return to Homepage">
            <i data-lucide="home"></i> Return to Homepage
          </a>
          <a href="/services" class="btn btn-secondary" title="Explore Workshop Services">
            <i data-lucide="wrench"></i> Specialist Services
          </a>
          <a href="/booking" class="btn btn-secondary" title="Book Online">
            <i data-lucide="calendar"></i> Book Online
          </a>
          <a href="/contact" class="btn btn-outline-primary" title="Contact Us">
            <i data-lucide="phone"></i> Contact Workshop
          </a>
        </div>

        <div class="not-found-card glass-card">
          <h3 class="not-found-card-title"><i data-lucide="compass"></i> Quick Navigation Directory</h3>
          <div class="not-found-links-grid">
            <a href="/" class="not-found-link-item">
              <i data-lucide="home"></i>
              <div>
                <strong>Home</strong>
                <small>Workshop overview & verified reviews</small>
              </div>
            </a>
            <a href="/services" class="not-found-link-item">
              <i data-lucide="cpu"></i>
              <div>
                <strong>Diagnostics & Rebuilds</strong>
                <small>Dealer-level mechanical repairs</small>
              </div>
            </a>
            <a href="/tuning" class="not-found-link-item">
              <i data-lucide="zap"></i>
              <div>
                <strong>ECU Remapping & Tuning</strong>
                <small>Dyno profiles, towing & torque</small>
              </div>
            </a>
            <a href="/4x4" class="not-found-link-item">
              <i data-lucide="shield"></i>
              <div>
                <strong>4x4 Specialist Upgrades</strong>
                <small>Lift kits, diffs & off-road mud gear</small>
              </div>
            </a>
            <a href="/booking" class="not-found-link-item">
              <i data-lucide="calendar"></i>
              <div>
                <strong>Online Booking</strong>
                <small>Reserve your workshop slot</small>
              </div>
            </a>
            <a href="/contact" class="not-found-link-item">
              <i data-lucide="map-pin"></i>
              <div>
                <strong>Workshop Location</strong>
                <small>31c Atkinson Ave, Otahuhu</small>
              </div>
            </a>
          </div>
        </div>

      </div>
    </div>
  `;
}

// ==========================================================================
// NEW PAGES: OWNER ADMIN LOGIN & DASHBOARD
// ==========================================================================

// --- OWNER LOGIN VIEW (`#/admin-login`) ---
function renderAdminLogin(container) {
  container.innerHTML = `
    <div class="auth-standalone-wrapper">
      <div class="auth-brand-header">
        <a href="/" class="auth-brand-logo" title="Return to Diesel Drive Website">
          DIESEL<span class="accent-text">DRIVE</span>
        </a>
        <div>
          <span class="auth-restricted-badge">
            <i data-lucide="shield-check" style="width: 13px; height: 13px;"></i>
            Restricted Access &bull; Authorized Personnel Only
          </span>
        </div>
      </div>

      <div class="auth-card zoom-in-up">
        <div class="auth-card-top">
          <div class="auth-icon-circle">
            <i data-lucide="lock" style="width: 22px; height: 22px;"></i>
          </div>
          <h2>Owner Portal Login</h2>
          <p>Sign in with your administrative credentials to manage vehicle service bookings and workshop operations.</p>
        </div>

        <form onsubmit="handleAdminLoginSubmit(event)" class="auth-form">
          <div class="auth-field">
            <label for="admin-user">Administrator Username</label>
            <div class="auth-input-group">
              <i data-lucide="user" class="input-icon"></i>
              <input type="text" id="admin-user" class="auth-input" placeholder="admin" autocomplete="username" required>
            </div>
          </div>

          <div class="auth-field">
            <label for="admin-pass">Access Password</label>
            <div class="auth-input-group">
              <i data-lucide="key" class="input-icon"></i>
              <input type="password" id="admin-pass" class="auth-input" placeholder="••••••••" autocomplete="current-password" required>
              <button type="button" class="auth-pwd-toggle" onclick="togglePasswordVisibility('admin-pass', this)" title="Show / Hide Password">
                <i data-lucide="eye" id="admin-pass-eye" style="width: 16px; height: 16px;"></i>
              </button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary auth-submit-btn" id="admin-login-btn">
            <i data-lucide="log-in" style="width: 18px; height: 18px;"></i>
            <span>Sign In to Dashboard</span>
          </button>
        </form>

        <div class="auth-card-footer">
          <a href="/" class="auth-back-link">
            <i data-lucide="arrow-left" style="width: 16px; height: 16px;"></i>
            <span>Return to Diesel Drive Website</span>
          </a>
        </div>
      </div>

      <div class="auth-footer-notice">
        <span>&copy; ${new Date().getFullYear()} Diesel Drive Auckland &bull; Encrypted Session</span>
      </div>
    </div>
  `;
}

window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  const icon = btn.querySelector('i');
  if (icon) {
    icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    if (window.lucide) window.lucide.createIcons();
  }
};

window.handleAdminLoginSubmit = async function(event) {
  event.preventDefault();
  const username = document.getElementById('admin-user').value;
  const password = document.getElementById('admin-pass').value;

  try {
    const res = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const data = await res.json();
      sessionStorage.setItem('adminToken', data.token);
      showToast('Logged In', 'Welcome back, Owner account authenticated.', 'success');
      navigateTo('/admin');
    } else {
      showToast('Auth Failure', 'Incorrect administrator username or password.', 'error');
    }
  } catch (err) {
    console.error('Login error:', err);
    showToast('Server Connection Error', 'Failed to connect to backend api.', 'error');
  }
};

// --- OWNER ADMINISTRATIVE DASHBOARD VIEW (`#/admin`) ---
function renderAdminDashboard(container) {
  const totalBookings = state.bookingsList.length;
  const pendingCount = state.bookingsList.filter(b => b.status === 'Pending').length;
  const confirmedCount = state.bookingsList.filter(b => b.status === 'Confirmed').length;
  const completedCount = state.bookingsList.filter(b => b.status === 'Completed').length;
  const totalReviews = state.adminReviewsList.length;
  const avgRating = totalReviews > 0
    ? (state.adminReviewsList.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / totalReviews).toFixed(1)
    : '5.0';

  let tabContentHtml = '';

  if (state.adminTab === 'bookings') {
    // Filter bookings based on status filter and search query
    let filteredBookings = state.bookingsList;
    if (state.adminStatusFilter !== 'all') {
      filteredBookings = filteredBookings.filter(b => b.status === state.adminStatusFilter);
    }
    if (state.adminSearchQuery.trim()) {
      const q = state.adminSearchQuery.toLowerCase();
      filteredBookings = filteredBookings.filter(b => 
        (b.firstName && b.firstName.toLowerCase().includes(q)) ||
        (b.lastName && b.lastName.toLowerCase().includes(q)) ||
        (b.phone && b.phone.includes(q)) ||
        (b.email && b.email.toLowerCase().includes(q)) ||
        (b.vehicleMake && b.vehicleMake.toLowerCase().includes(q)) ||
        (b.vehicleModel && b.vehicleModel.toLowerCase().includes(q)) ||
        (b.serviceType && b.serviceType.toLowerCase().includes(q))
      );
    }

    let rowsHtml = '';
    if (filteredBookings.length === 0) {
      rowsHtml = `<tr><td colspan="7" style="text-align: center; padding: 3.5rem; color: var(--text-muted);">
        <i data-lucide="inbox" style="width: 36px; height: 36px; margin-bottom: 0.8rem; display: block; margin-left: auto; margin-right: auto; opacity: 0.5;"></i>
        No matching booking records found.
      </td></tr>`;
    } else {
      filteredBookings.forEach(booking => {
        let badgeClass = 'status-badge-pending';
        let statusIcon = 'clock';
        if (booking.status === 'Confirmed') { badgeClass = 'status-badge-confirmed'; statusIcon = 'wrench'; }
        if (booking.status === 'Completed') { badgeClass = 'status-badge-completed'; statusIcon = 'check-check'; }
        
        const initials = ((booking.firstName?.[0] || '') + (booking.lastName?.[0] || '')).toUpperCase() || 'DD';
        
        let actionButtons = '';
        if (booking.status === 'Pending') {
          actionButtons += `<button class="btn-admin-small btn-admin-confirm" onclick="updateBookingStatus(${booking.id}, 'Confirmed')" title="Confirm Booking"><i data-lucide="check" style="width: 13px; height: 13px; margin-right: 3px;"></i> Confirm</button>`;
        }
        if (booking.status === 'Confirmed') {
          actionButtons += `<button class="btn-admin-small btn-admin-complete" onclick="updateBookingStatus(${booking.id}, 'Completed')" title="Mark as Completed"><i data-lucide="check-check" style="width: 13px; height: 13px; margin-right: 3px;"></i> Complete</button>`;
        }
        
        const cleanPhone = (booking.phone || '').replace(/[^0-9]/g, '');
        const waMsg = `*DIESEL DRIVE WORKSHOP UPDATE*\n\nHello ${booking.firstName}, we have reviewed your booking for the ${booking.vehicleMake || ''} ${booking.vehicleModel || ''} on ${booking.preferredDate || ''} (${booking.preferredTime || ''}).`;
        const waUrl = `https://wa.me/${cleanPhone.startsWith('0') ? '64' + cleanPhone.substring(1) : cleanPhone}?text=${encodeURIComponent(waMsg)}`;
        
        actionButtons += `<a href="${waUrl}" target="_blank" class="btn-admin-small btn-admin-whatsapp" title="Message customer on WhatsApp"><i data-lucide="message-square" style="width: 13px; height: 13px; margin-right: 3px;"></i> WhatsApp</a>`;
        actionButtons += `<button class="btn-admin-small btn-admin-delete" onclick="deleteBooking(${booking.id})" title="Delete booking"><i data-lucide="trash-2" style="width: 13px; height: 13px;"></i></button>`;

        rowsHtml += `
          <tr>
            <td><strong>#${booking.id}</strong></td>
            <td>
              <div class="customer-cell-flex">
                <div class="customer-avatar">${initials}</div>
                <div class="customer-meta">
                  <span class="customer-name">${booking.firstName} ${booking.lastName}</span>
                  <span class="customer-contact">${booking.phone} &bull; ${booking.email}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="vehicle-tag">
                <i data-lucide="car"></i>
                ${booking.vehicleMake || 'Vehicle'} ${booking.vehicleModel || ''} ${booking.vehicleYear ? '(' + booking.vehicleYear + ')' : ''}
              </span>
            </td>
            <td><span class="service-pill">${booking.serviceType || 'Routine Service'}</span></td>
            <td>
              <div class="date-cell">
                <span class="date-main">${booking.preferredDate || 'Flexible'}</span>
                <span class="time-slot-tag">${booking.preferredTime || 'Anytime'}</span>
              </div>
            </td>
            <td>
              <span class="status-badge ${badgeClass}">
                <i data-lucide="${statusIcon}" style="width: 12px; height: 12px;"></i>
                ${booking.status}
              </span>
            </td>
            <td>
              <div class="admin-actions-cell">
                ${actionButtons}
              </div>
            </td>
          </tr>
        `;
      });
    }

    tabContentHtml = `
      <!-- Control Bar with Search and Filter Chips -->
      <div class="admin-control-bar">
        <div class="admin-search-wrapper">
          <i data-lucide="search"></i>
          <input type="text" class="admin-search-input" placeholder="Search customer, phone, or vehicle..." value="${state.adminSearchQuery}" oninput="handleAdminSearch(this.value)">
        </div>
        <div class="admin-filter-group">
          <button class="admin-filter-chip ${state.adminStatusFilter === 'all' ? 'active' : ''}" onclick="handleAdminFilter('all')">All (${totalBookings})</button>
          <button class="admin-filter-chip chip-pending ${state.adminStatusFilter === 'Pending' ? 'active' : ''}" onclick="handleAdminFilter('Pending')">Pending (${pendingCount})</button>
          <button class="admin-filter-chip ${state.adminStatusFilter === 'Confirmed' ? 'active' : ''}" onclick="handleAdminFilter('Confirmed')">Confirmed (${confirmedCount})</button>
          <button class="admin-filter-chip ${state.adminStatusFilter === 'Completed' ? 'active' : ''}" onclick="handleAdminFilter('Completed')">Completed (${completedCount})</button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer details</th>
              <th>Vehicle spec</th>
              <th>Service</th>
              <th>Date & Time</th>
              <th>Status</th>
              <th>Quick Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  } else if (state.adminTab === 'reviews') {
    let reviewsListHtml = '';
    if (state.adminReviewsList.length === 0) {
      reviewsListHtml = `<div style="padding: 3.5rem; text-align: center; color: var(--text-muted); background: #FFFFFF; border-radius: 14px; border: 1px solid var(--border-color);">No customer reviews stored in database yet.</div>`;
    } else {
      state.adminReviewsList.forEach(rev => {
        let starsHtml = '';
        for (let s = 1; s <= 5; s++) {
          starsHtml += `<i data-lucide="star" style="width: 14px; height: 14px; margin-right: 2px; ${s <= rev.rating ? 'fill: #F59E0B; color: #F59E0B;' : 'color: #CBD5E1;'}"></i>`;
        }

        reviewsListHtml += `
          <div class="admin-review-card">
            <div style="flex-grow: 1;">
              <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.6rem;">
                <img src="${rev.avatar || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                <div>
                  <strong style="color: var(--carbon-dark);">${rev.name}</strong> &bull; <span style="font-size: 0.85rem; color: var(--text-muted);">${rev.vehicle}</span>
                </div>
                <div style="margin-left: auto; display: flex; align-items: center;">${starsHtml}</div>
              </div>
              <p style="font-size: 0.94rem; font-style: italic; color: var(--text-gray); line-height: 1.5;">"${rev.quote}"</p>
            </div>
            <div>
              <button class="btn-admin-small btn-admin-delete" onclick="deleteReview(${rev.id})" title="Delete review permanently"><i data-lucide="trash-2" style="margin-right: 3px; width: 13px; height: 13px;"></i> Delete</button>
            </div>
          </div>
        `;
      });
    }

    tabContentHtml = `
      <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 1.25rem; text-transform: uppercase; font-weight: 800; color: var(--carbon-dark);">Verified Reviews Moderator</h3>
        <span style="font-size: 0.85rem; color: var(--text-muted);">${totalReviews} testimonials published</span>
      </div>
      <div>
        ${reviewsListHtml}
      </div>
    `;
  } else if (state.adminTab === 'invite') {
    tabContentHtml = `
      <div class="invite-generator-box">
        <h3 style="font-size: 1.3rem; margin-bottom: 0.6rem; text-transform: uppercase; font-weight: 800; color: var(--carbon-dark);">Customer Review Invite Generator</h3>
        <p style="color: var(--text-gray); font-size: 0.94rem; margin-bottom: 2rem; line-height: 1.5;">
          Create a personalized, one-time review submission link for completed workshop jobs. The link automatically fills the customer's name and vehicle specs and expires after one use.
        </p>

        <form onsubmit="handleGenerateInviteSubmit(event)" style="display: flex; flex-direction: column; gap: 1.4rem;">
          <div class="form-grid">
            <div class="form-group">
              <label for="invite-name">Customer First Name</label>
              <input type="text" id="invite-name" class="form-input" placeholder="e.g. Peter" value="${state.inviteName}" oninput="state.inviteName = this.value" required>
            </div>
            <div class="form-group">
              <label for="invite-vehicle">Vehicle Make & Model</label>
              <input type="text" id="invite-vehicle" class="form-input" placeholder="e.g. Toyota Hilux 4WD" value="${state.inviteVehicle}" oninput="state.inviteVehicle = this.value" required>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="align-self: flex-start;"><i data-lucide="link"></i> Generate One-Time Review Link</button>
        </form>

        ${state.generatedInviteUrl ? `
          <div style="margin-top: 2.2rem; border-top: 1px solid var(--border-color); padding-top: 1.8rem;">
            <h4 style="font-size: 0.95rem; text-transform: uppercase; margin-bottom: 0.5rem; color: var(--carbon-dark); font-weight: 800;">Generated Personalized URL:</h4>
            <div class="invite-link-display">
              <span id="invite-link-text">${state.generatedInviteUrl}</span>
              <button onclick="copyInviteLinkToClipboard()" title="Copy link to clipboard"><i data-lucide="copy"></i> Copy Link</button>
            </div>
            <div style="margin-top: 1.2rem; display: flex; gap: 1rem;">
              <a href="https://wa.me/?text=${encodeURIComponent('Hello ' + state.inviteName + ', thank you for choosing Diesel Drive for your ' + state.inviteVehicle + '. We would appreciate your feedback. Please leave us a review here: ' + state.generatedInviteUrl)}" target="_blank" class="btn btn-primary" style="background: #25D366; border-color: #25D366; font-size: 0.88rem; padding: 0.65rem 1.3rem;">
                <i data-lucide="message-square"></i> Send Link via WhatsApp
              </a>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  } else if (state.adminTab === 'security') {
    tabContentHtml = `
      <div class="invite-generator-box">
        <div style="display: flex; align-items: center; gap: 0.9rem; margin-bottom: 1.2rem;">
          <div style="background: rgba(255, 107, 0, 0.12); color: var(--accent-primary); width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 107, 0, 0.25);">
            <i data-lucide="shield-check" style="width: 24px; height: 24px;"></i>
          </div>
          <div>
            <h3 style="font-size: 1.35rem; text-transform: uppercase; font-weight: 800; color: var(--carbon-dark); margin: 0;">Account & Security Settings</h3>
            <p style="color: var(--text-gray); font-size: 0.92rem; margin: 0.2rem 0 0 0;">Update administrator credentials for workshop portal authentication.</p>
          </div>
        </div>

        <div style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.1rem 1.4rem; margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <span style="font-size: 0.78rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Active Administrator Account</span>
            <strong style="font-size: 1.15rem; color: var(--carbon-dark); font-family: var(--font-heading);">${state.currentAdminUsername || 'admin'}</strong>
          </div>
          <span style="background: #ECFDF5; color: #064E3B; border: 1px solid #A7F3D0; padding: 0.35rem 0.9rem; border-radius: 50px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; display: inline-flex; align-items: center; gap: 0.4rem;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981;"></span> Active
          </span>
        </div>

        <form id="admin-security-form" onsubmit="handleUpdateCredentialsSubmit(event)">
          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="sec-curr-pass" style="font-weight: 700; font-size: 0.88rem; color: var(--carbon-dark); margin-bottom: 0.5rem; display: block;">Current Password <span style="color: #EF4444;">*</span></label>
            <div style="position: relative;">
              <input type="password" id="sec-curr-pass" class="form-input" required placeholder="Enter current admin password" style="width: 100%; padding-right: 2.8rem;">
              <button type="button" onclick="togglePasswordVisibility('sec-curr-pass', 'sec-curr-eye')" style="position: absolute; right: 0.8rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-gray); padding: 0;" aria-label="Toggle password visibility">
                <i data-lucide="eye" id="sec-curr-eye" style="width: 18px; height: 18px;"></i>
              </button>
            </div>
          </div>

          <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
            <div class="form-group">
              <label for="sec-new-user" style="font-weight: 700; font-size: 0.88rem; color: var(--carbon-dark); margin-bottom: 0.5rem; display: block;">New Username <span style="color: #EF4444;">*</span></label>
              <input type="text" id="sec-new-user" class="form-input" required minlength="3" value="${state.currentAdminUsername || 'admin'}" placeholder="e.g. workshop_owner" style="width: 100%;">
            </div>

            <div class="form-group">
              <label for="sec-new-pass" style="font-weight: 700; font-size: 0.88rem; color: var(--carbon-dark); margin-bottom: 0.5rem; display: block;">New Password <span style="color: #EF4444;">*</span></label>
              <div style="position: relative;">
                <input type="password" id="sec-new-pass" class="form-input" required minlength="4" placeholder="Minimum 4 characters" style="width: 100%; padding-right: 2.8rem;">
                <button type="button" onclick="togglePasswordVisibility('sec-new-pass', 'sec-new-eye')" style="position: absolute; right: 0.8rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-gray); padding: 0;" aria-label="Toggle password visibility">
                  <i data-lucide="eye" id="sec-new-eye" style="width: 18px; height: 18px;"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 2rem;">
            <label for="sec-confirm-pass" style="font-weight: 700; font-size: 0.88rem; color: var(--carbon-dark); margin-bottom: 0.5rem; display: block;">Confirm New Password <span style="color: #EF4444;">*</span></label>
            <input type="password" id="sec-confirm-pass" class="form-input" required minlength="4" placeholder="Re-enter your new password" style="width: 100%;">
          </div>

          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <button type="submit" id="save-sec-btn" class="btn btn-primary" style="padding: 0.85rem 2rem;">
              <i data-lucide="save"></i> Update Credentials
            </button>
            <span style="font-size: 0.84rem; color: var(--text-muted);">Changes take effect immediately across all sessions.</span>
          </div>
        </form>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="admin-dashboard-container">
      <div class="container">
        
        <!-- Admin Top Navigation Header -->
        <div class="admin-top-bar">
          <div class="admin-top-brand">
            <a href="/admin" class="logo" style="font-size: 1.5rem;">
              DIESEL<span class="accent-text">DRIVE</span>
            </a>
            <span class="admin-title-badge">Owner Management Portal</span>
          </div>
          <div class="admin-top-actions">
            <div class="admin-user-tag">
              <span class="status-dot"></span>
              <span>${state.currentAdminUsername || 'Owner Administrator'}</span>
            </div>
            <a href="/" target="_blank" class="btn-admin-header btn-admin-view-site" title="Open Public Website">
              <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
              <span>View Website</span>
            </a>
            <button class="btn-admin-header btn-admin-logout" onclick="handleAdminLogout()" title="Log out from dashboard">
              <i data-lucide="log-out" style="width: 14px; height: 14px;"></i>
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <!-- Executive KPI Stats Row -->
        <div class="admin-kpi-grid">
          <div class="admin-kpi-card">
            <div class="admin-kpi-icon">
              <i data-lucide="calendar" style="width: 22px; height: 22px; color: var(--carbon-dark);"></i>
            </div>
            <div class="admin-kpi-info">
              <span class="admin-kpi-num">${totalBookings}</span>
              <span class="admin-kpi-label">Total Bookings</span>
              <span class="admin-kpi-sub">All-time customer requests</span>
            </div>
          </div>

          <div class="admin-kpi-card kpi-pending">
            <div class="admin-kpi-icon">
              <i data-lucide="alert-circle" style="width: 22px; height: 22px;"></i>
            </div>
            <div class="admin-kpi-info">
              <span class="admin-kpi-num">${pendingCount}</span>
              <span class="admin-kpi-label">Pending Action</span>
              <span class="admin-kpi-sub">Requires workshop confirmation</span>
            </div>
          </div>

          <div class="admin-kpi-card kpi-confirmed">
            <div class="admin-kpi-icon">
              <i data-lucide="wrench" style="width: 22px; height: 22px;"></i>
            </div>
            <div class="admin-kpi-info">
              <span class="admin-kpi-num">${confirmedCount}</span>
              <span class="admin-kpi-label">Active / Confirmed</span>
              <span class="admin-kpi-sub">Scheduled for repair or bay work</span>
            </div>
          </div>

          <div class="admin-kpi-card kpi-reviews">
            <div class="admin-kpi-icon">
              <i data-lucide="star" style="width: 22px; height: 22px;"></i>
            </div>
            <div class="admin-kpi-info">
              <span class="admin-kpi-num">${avgRating} <span style="font-size: 1rem; color: #F59E0B;">★</span></span>
              <span class="admin-kpi-label">Customer Reviews</span>
              <span class="admin-kpi-sub">${totalReviews} verified testimonials</span>
            </div>
          </div>
        </div>

        <!-- Tabs Navigation -->
        <div class="admin-tabs">
          <button class="admin-tab-btn ${state.adminTab === 'bookings' ? 'active' : ''}" onclick="switchAdminTab('bookings')">
            <i data-lucide="calendar-check"></i>
            <span>Bookings Ledger</span>
            <span class="admin-tab-pill">${state.bookingsList.length}</span>
          </button>
          <button class="admin-tab-btn ${state.adminTab === 'reviews' ? 'active' : ''}" onclick="switchAdminTab('reviews')">
            <i data-lucide="message-square"></i>
            <span>Verified Reviews</span>
            <span class="admin-tab-pill">${state.adminReviewsList.length}</span>
          </button>
          <button class="admin-tab-btn ${state.adminTab === 'invite' ? 'active' : ''}" onclick="switchAdminTab('invite')">
            <i data-lucide="link"></i>
            <span>Generate Review Invite</span>
          </button>
          <button class="admin-tab-btn ${state.adminTab === 'security' ? 'active' : ''}" onclick="switchAdminTab('security')">
            <i data-lucide="shield-check"></i>
            <span>Account Security</span>
          </button>
        </div>

        <!-- Dynamic Tab Panel Mount -->
        <div id="admin-tab-panel">
          ${tabContentHtml}
        </div>

        <!-- Admin Clean Minimal Footer -->
        <div class="admin-mini-footer">
          <span>&copy; ${new Date().getFullYear()} Diesel Drive Auckland &bull; Workshop Administration &bull; Version 1.0</span>
        </div>

      </div>
    </div>
  `;
}

window.handleAdminSearch = function(val) {
  state.adminSearchQuery = val;
  router();
};

window.handleAdminFilter = function(status) {
  state.adminStatusFilter = status;
  router();
};

window.switchAdminTab = function(tabName) {
  state.adminTab = tabName;
  router();
};

window.handleAdminLogout = function() {
  sessionStorage.removeItem('adminToken');
  showToast('Logged Out', 'Successfully logged out from owner dashboard.', 'success');
  navigateTo('/');
};

window.togglePasswordVisibility = function(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (input && icon) {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    if (window.lucide) window.lucide.createIcons();
  }
};

window.handleUpdateCredentialsSubmit = async function(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('sec-curr-pass').value;
  const newUsername = document.getElementById('sec-new-user').value.trim();
  const newPassword = document.getElementById('sec-new-pass').value;
  const confirmPassword = document.getElementById('sec-confirm-pass').value;
  const token = sessionStorage.getItem('adminToken');

  if (newPassword !== confirmPassword) {
    showToast('Password Mismatch', 'New password and confirmation do not match.', 'error');
    return;
  }

  const saveBtn = document.getElementById('save-sec-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<div class="loader" style="width: 14px; height: 14px; border-width: 2px; margin-right: 0.5rem; display: inline-block;"></div> Updating...`;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newUsername, newPassword, token })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      state.currentAdminUsername = data.username || newUsername;
      showToast('Credentials Updated', 'Administrator username and password updated successfully.', 'success');
      document.getElementById('sec-curr-pass').value = '';
      document.getElementById('sec-new-pass').value = '';
      document.getElementById('sec-confirm-pass').value = '';
      router();
    } else {
      showToast('Update Failed', data.error || 'Failed to update credentials.', 'error');
    }
  } catch (err) {
    console.error('Credentials update error:', err);
    showToast('Connection Error', 'Failed to communicate with server.', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i data-lucide="save"></i> Update Credentials`;
      if (window.lucide) window.lucide.createIcons();
    }
  }
};

window.updateBookingStatus = async function(id, newStatus) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    
    if (res.ok) {
      showToast('Status Updated', `Booking #${id} status changed to ${newStatus}.`, 'success');
      await fetchAdminData();
      router();
    } else {
      showToast('Error', 'Failed to update status in database.', 'error');
    }
  } catch (err) {
    console.error('Update status error:', err);
  }
};

window.deleteBooking = async function(id) {
  if (!confirm(`Are you sure you want to delete Booking #${id} permanently?`)) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/bookings/${id}`, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      showToast('Booking Deleted', `Booking #${id} successfully deleted.`, 'success');
      await fetchAdminData();
      router();
    } else {
      showToast('Error', 'Failed to delete booking.', 'error');
    }
  } catch (err) {
    console.error('Delete booking error:', err);
  }
};

window.deleteReview = async function(id) {
  if (!confirm(`Are you sure you want to delete review #${id} permanently from database?`)) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/reviews/${id}`, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      showToast('Review Deleted', `Review #${id} deleted successfully.`, 'success');
      await fetchAdminData();
      router();
    } else {
      showToast('Error', 'Failed to delete review.', 'error');
    }
  } catch (err) {
    console.error('Delete review error:', err);
  }
};

// Generate Review invite URL for Customer with SQLite invite token creation
window.handleGenerateInviteSubmit = async function(event) {
  event.preventDefault();
  const name = state.inviteName.trim();
  const vehicle = state.inviteVehicle.trim();
  
  if (!name || !vehicle) return;
  
  try {
    const res = await fetch(`${API_BASE_URL}/api/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, vehicle })
    });

    if (res.ok) {
      const data = await res.json();
      const baseUrl = `${window.location.origin}${BASE_PATH}/submit-review`;
      state.generatedInviteUrl = `${baseUrl}?token=${data.token}`;
      showToast('Token Generated', 'Unique one-time link created successfully.', 'success');
      router();
    } else {
      showToast('Error', 'Failed to generate token record.', 'error');
    }
  } catch (err) {
    console.error('Invite token generate failed:', err);
  }
};

window.copyInviteLinkToClipboard = function() {
  const linkText = document.getElementById('invite-link-text');
  if (linkText) {
    navigator.clipboard.writeText(linkText.textContent).then(() => {
      showToast('Copied to Clipboard', 'Invite URL copied to clipboard.', 'success');
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  }
};

// ==========================================================================
// CLIENT SUBMIT REVIEW VIEW (One-Time token validate & photo upload option)
// ==========================================================================

function renderSubmitReview(container) {
  let contentHtml = '';

  if (state.reviewInviteStatus === 'loading') {
    contentHtml = `
      <div style="text-align: center; padding: 4rem;">
        <div class="loader" style="margin: 0 auto 1.5rem auto;"></div>
        <p style="color: var(--text-gray);">Validating invitation security token...</p>
      </div>
    `;
  } else if (state.reviewInviteStatus === 'invalid') {
    contentHtml = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <div class="service-icon-box" style="margin: 0 auto 1.5rem auto; background-color: #FEE2E2;"><i data-lucide="alert-octagon" style="color: #EF4444; width: 36px; height: 36px;"></i></div>
        <h3 style="font-size: 1.4rem; text-transform: uppercase; color: #B91C1C;">Invalid Invite Link</h3>
        <p style="font-size: 0.95rem; color: var(--text-gray); margin-top: 0.8rem; max-width: 450px; margin-left: auto; margin-right: auto;">
          This review link is invalid or has expired. Please contact the workshop to request a new feedback link.
        </p>
        <a href="/" class="btn btn-secondary" style="margin-top: 2rem;"><i data-lucide="home"></i> Return to Homepage</a>
      </div>
    `;
  } else if (state.reviewInviteStatus === 'used') {
    contentHtml = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <div class="service-icon-box" style="margin: 0 auto 1.5rem auto; background-color: #D1FAE5;"><i data-lucide="check-check" style="color: #10B981; width: 36px; height: 36px;"></i></div>
        <h3 style="font-size: 1.4rem; text-transform: uppercase; color: #047857;">Feedback Already Submitted</h3>
        <p style="font-size: 0.95rem; color: var(--text-gray); margin-top: 0.8rem; max-width: 450px; margin-left: auto; margin-right: auto;">
          Thank you! You have already submitted feedback using this invitation. We appreciate your review and look forward to servicing your vehicle in the future.
        </p>
        <a href="/" class="btn btn-secondary" style="margin-top: 2rem;"><i data-lucide="home"></i> Return to Homepage</a>
      </div>
    `;
  } else if (state.reviewInviteStatus === 'valid') {
    let ratingButtonsHtml = '';
    for (let s = 1; s <= 5; s++) {
      ratingButtonsHtml += `
        <button type="button" class="star-select-btn ${s <= state.selectedRating ? 'active' : ''}" onclick="selectRatingStar(${s})" aria-label="Rate ${s} stars">
          ★
        </button>
      `;
    }

    contentHtml = `
      <div style="text-align: center; margin-bottom: 2rem;">
        <div class="service-icon-box" style="margin: 0 auto 1rem auto;"><i data-lucide="message-square" style="color: var(--primary); width: 36px; height: 36px;"></i></div>
        <h3 style="font-size: 1.4rem; text-transform: uppercase;">Customer Review Form</h3>
        <p style="font-size: 0.9rem; color: var(--text-gray); margin-top: 0.5rem;">
          Hi <strong>${state.reviewInviteName}</strong>, thank you for choosing Diesel Drive for your <strong>${state.reviewInviteVehicle}</strong>.
        </p>
      </div>

      <form onsubmit="handleClientReviewSubmit(event)" style="display: flex; flex-direction: column; gap: 1.5rem;">
        
        <div class="form-group">
          <label for="rev-client-name">Your Name</label>
          <input type="text" id="rev-client-name" class="form-input" placeholder="Peter" value="${state.reviewInviteName}" required readonly style="background-color: #E2E8F0; cursor: not-allowed;">
        </div>

        <div class="form-group">
          <label for="rev-client-vehicle">Your Vehicle</label>
          <input type="text" id="rev-client-vehicle" class="form-input" placeholder="Toyota Hilux 4WD" value="${state.reviewInviteVehicle}" required readonly style="background-color: #E2E8F0; cursor: not-allowed;">
        </div>

        <div class="form-group">
          <label>Service Rating</label>
          <div class="star-selector">
            ${ratingButtonsHtml}
          </div>
        </div>

        <!-- Custom Photo Upload -->
        <div class="form-group">
          <label>Profile Picture (Optional)</label>
          <div id="rev-photo-uploader-wrapper">
            ${state.reviewAvatarBase64 ? `
              <div style="display: flex; align-items: center; justify-content: space-between; background-color: #EFF6FF; border: 1px solid var(--border-color); padding: 0.8rem 1.2rem; border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                  <img src="${state.reviewAvatarBase64}" alt="Review avatar preview" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;">
                  <span style="font-size: 0.85rem; color: var(--text-gray); font-weight: 600;">Custom Photo Loaded</span>
                </div>
                <button type="button" class="btn-admin-small btn-admin-delete" onclick="removeReviewAvatar(event)"><i data-lucide="x" style="width: 12px; height: 12px; margin-right: 2px;"></i> Remove</button>
              </div>
            ` : `
              <div class="upload-box" onclick="triggerReviewAvatarSelect()">
                <i data-lucide="camera" style="width: 28px; height: 28px;"></i>
                <span style="font-size: 0.88rem; font-weight: 600;">Upload Profile Photo (Click to select)</span>
                <input type="file" id="rev-file-input" style="display: none;" onchange="handleReviewAvatarChange(this)" accept="image/*">
              </div>
            `}
          </div>
        </div>

        <div class="form-group">
          <label for="rev-client-quote">Review Comment <span class="required">*</span></label>
          <textarea id="rev-client-quote" class="form-input" rows="4" placeholder="Describe the service (diagnostics, performance mapping, repairs)..." required></textarea>
        </div>

        <button type="submit" class="btn btn-primary" style="margin-top: 1rem;"><i data-lucide="send"></i> Submit Review</button>

      </form>
    `;
  }

  container.innerHTML = `
    <section class="page-hero">
      <div class="container">
        <h1 class="page-hero-title">Submit Service Review</h1>
        <p class="page-hero-desc">We value your business. Leave a short review detailing your garage experience.</p>
      </div>
    </section>

    <section class="section">
      <div class="container login-card-wrapper">
        <div class="glass-card login-card zoom-in-up" style="max-width: 500px;">
          ${contentHtml}
        </div>
      </div>
    </section>
  `;
}

window.selectRatingStar = function(ratingVal) {
  state.selectedRating = ratingVal;
  document.querySelectorAll('.star-select-btn').forEach((btn, idx) => {
    if (idx < ratingVal) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

// Image selection trigger
window.triggerReviewAvatarSelect = function() {
  const fileInput = document.getElementById('rev-file-input');
  if (fileInput) fileInput.click();
};

// Convert review picture to Base64
window.handleReviewAvatarChange = function(inputEl) {
  if (inputEl.files && inputEl.files[0]) {
    const file = inputEl.files[0];
    
    // Check sizing
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image Too Large', 'Please upload a photo smaller than 2MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      state.reviewAvatarBase64 = e.target.result;
      router(); // redraw to show loaded wrapper
      showToast('Photo Loaded', 'Profile photo attached successfully.', 'success');
    };
    reader.readAsDataURL(file);
  }
};

// Remove attached photo
window.removeReviewAvatar = function(e) {
  e.stopPropagation();
  state.reviewAvatarBase64 = '';
  router(); // redraw
};

// Client Review form submit to SQLite DB via Express
window.handleClientReviewSubmit = async function(event) {
  event.preventDefault();
  
  const name = document.getElementById('rev-client-name').value.trim();
  const vehicle = document.getElementById('rev-client-vehicle').value.trim();
  const quote = document.getElementById('rev-client-quote').value.trim();
  const rating = state.selectedRating;
  const avatar = state.reviewAvatarBase64 || null;
  const token = state.reviewToken;

  if (!name || !vehicle || !quote) {
    showToast('Incomplete', 'Please fill out all required fields.', 'error');
    return;
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="loader" style="width: 16px; height: 16px; border-width: 2px; margin-right: 0.5rem; display: inline-block;"></div> Submitting...`;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, vehicle, rating, quote, avatar, token })
    });

    if (res.ok) {
      showToast('Review Submitted', 'Thank you! Your feedback has been stored and published on our homepage.', 'success');
      
      // Reset state variables
      state.inviteName = '';
      state.inviteVehicle = '';
      state.generatedInviteUrl = '';
      state.reviewAvatarBase64 = '';
      state.selectedRating = 5;

      setTimeout(() => {
        navigateTo('/');
      }, 1500);
    } else {
      const errRes = await res.json();
      showToast('Error', errRes.error || 'Failed to submit review.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="send"></i> Submit Review`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  } catch (err) {
    console.error('Review submit error:', err);
    showToast('Connection Error', 'Failed to communicate with backend.', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="send"></i> Submit Review`;
      if (window.lucide) window.lucide.createIcons();
    }
  }
};

// Global Link Interceptor for Clean SPA Routing
document.addEventListener('click', (e) => {
  const anchor = e.target.closest('a');
  if (!anchor) return;
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

  const href = anchor.getAttribute('href');
  if (!href) return;
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;

  // Intercept internal path routing and legacy hash links
  if (href.startsWith('/') || href.startsWith('#/')) {
    e.preventDefault();
    navigateTo(href);
  }
});

// 12. Initializer
window.addEventListener('popstate', router);
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
