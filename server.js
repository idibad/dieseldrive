const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'dieseldrive.db');

// Enable CORS so frontend on GitHub Pages can communicate with backend
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase body size limit to support Base64 photo uploads

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// 1. Initialize SQLite Database Connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  } else {
    console.log('Connected to SQLite database: dieseldrive.db');
    initDatabase();
  }
});

// 2. Database Schema Initialization & Pre-populating defaults
function initDatabase() {
  db.serialize(() => {
    // Bookings Table (Relaxed constraints for optional fields to prevent write failures)
    db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        vehicleMake TEXT,
        vehicleModel TEXT,
        vehicleYear INTEGER,
        serviceType TEXT,
        preferredDate TEXT,
        preferredTime TEXT,
        additionalNotes TEXT,
        attachedFileName TEXT,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Reviews Table
    db.run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        vehicle TEXT NOT NULL,
        rating INTEGER NOT NULL,
        quote TEXT NOT NULL,
        avatar TEXT,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Review Invites Table (One-time links)
    db.run(`
      CREATE TABLE IF NOT EXISTS review_invites (
        token TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vehicle TEXT NOT NULL,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Pre-populate Default Reviews if table is empty
    db.get("SELECT COUNT(*) AS count FROM reviews", (err, row) => {
      if (row && row.count === 0) {
        const stmt = db.prepare("INSERT INTO reviews (name, vehicle, rating, quote, avatar, category) VALUES (?, ?, ?, ?, ?, ?)");
        stmt.run("Peter Wilson", "Nissan Patrol 4WD", 5, "Diesel Drive has serviced my fleet vehicles for over 10 years. They're consistently professional and their knowledge of diesels is unmatched in Auckland.", "https://randomuser.me/api/portraits/men/32.jpg", "4wd");
        stmt.run("Sarah Thompson", "Toyota Hilux SUV", 5, "After struggling with my Hilux for months, Diesel Drive diagnosed and fixed the issue on the first visit. Their prices are fair and service is excellent.", "https://randomuser.me/api/portraits/women/44.jpg", "suv");
        stmt.run("Marcus Brody", "Ford Transit Fleet Van", 5, "Our courier fleet has been serviced here for 5 years. Downtime has decreased by 30%. Priority booking slots keep our vans moving.", "https://randomuser.me/api/portraits/men/45.jpg", "fleet");
        stmt.run("Michael Chen", "Mitsubishi Pajero 4x4", 5, "As someone who knows nothing about engines, I appreciate that Diesel takes the time to explain issues clearly. My Pajero runs better than it has in years.", "https://randomuser.me/api/portraits/men/67.jpg", "4wd");
        stmt.run("Devon Reynolds", "Isuzu D-Max ECU Tuned", 5, "Amazing ECU mapping! Gained significant torque for towing my boat. The fuel economy on the highway improved by nearly 1.5L/100km.", "https://randomuser.me/api/portraits/men/82.jpg", "tuning");
        stmt.finalize();
        console.log("Database pre-populated with default customer reviews.");
      }
    });

    // Pre-populate Default Bookings for Owner preview if empty
    db.get("SELECT COUNT(*) AS count FROM bookings", (err, row) => {
      if (row && row.count === 0) {
        const stmt = db.prepare(`
          INSERT INTO bookings (firstName, lastName, email, phone, vehicleMake, vehicleModel, vehicleYear, serviceType, preferredDate, preferredTime, additionalNotes, attachedFileName, status) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run("John", "Miller", "john.miller@example.com", "021 998 8871", "Toyota", "Land Cruiser", 2018, "Performance Upgrade", "2026-08-20", "Morning (8:00 AM - 12:00 PM)", "ECU mapping stage 1 with custom dyno analysis.", "dyno_log.txt", "Confirmed");
        stmt.run("Sarah", "Connor", "sarah.c@skynet.org", "022 123 4567", "Nissan", "Patrol", 2021, "Repair", "2026-08-22", "Afternoon (12:00 PM - 5:00 PM)", "Rear differential lock check and hub locking gear overhaul.", null, "Pending");
        stmt.finalize();
        console.log("Database pre-populated with default owner bookings.");
      }
    });
    // Admin Credentials Table (Persistent username & password management)
    db.run(`
      CREATE TABLE IF NOT EXISTS admin_credentials (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure default admin credentials exist if table is empty
    db.get("SELECT * FROM admin_credentials WHERE id = 1", (err, row) => {
      if (!row) {
        const defaultUser = process.env.ADMIN_USER || 'admin';
        const defaultPass = process.env.ADMIN_PASS || 'admin';
        db.run("INSERT OR REPLACE INTO admin_credentials (id, username, password) VALUES (1, ?, ?)", [defaultUser, defaultPass]);
        console.log("Admin credentials initialized in database.");
      }
    });
  });
}

// 3. API ROUTES

// Admin Login Route (Owner Authentication)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM admin_credentials WHERE id = 1", (err, row) => {
    const validUser = row ? row.username : (process.env.ADMIN_USER || 'admin');
    const validPass = row ? row.password : (process.env.ADMIN_PASS || 'admin');
    if (username === validUser && password === validPass) {
      res.json({ success: true, token: 'session_owner_token_9988', username: validUser });
    } else {
      res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }
  });
});

// Get Current Admin Username
app.get('/api/admin/current-user', (req, res) => {
  db.get("SELECT username FROM admin_credentials WHERE id = 1", (err, row) => {
    const username = row ? row.username : (process.env.ADMIN_USER || 'admin');
    res.json({ username });
  });
});

// Update Admin Username and Password Route
app.post('/api/admin/credentials', (req, res) => {
  const { currentPassword, newUsername, newPassword, token } = req.body;
  if (!token || token !== 'session_owner_token_9988') {
    return res.status(401).json({ error: 'Unauthorized administrative access' });
  }
  if (!currentPassword || !newUsername || !newPassword) {
    return res.status(400).json({ error: 'All fields (current password, new username, new password) are required.' });
  }

  const cleanUser = newUsername.trim();
  const cleanPass = newPassword.trim();

  if (cleanUser.length < 3) {
    return res.status(400).json({ error: 'New username must be at least 3 characters long.' });
  }
  if (cleanPass.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  db.get("SELECT * FROM admin_credentials WHERE id = 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const validPass = row ? row.password : (process.env.ADMIN_PASS || 'admin');
    if (currentPassword !== validPass) {
      return res.status(400).json({ error: 'Current password does not match.' });
    }

    db.run(
      "INSERT OR REPLACE INTO admin_credentials (id, username, password, updated_at) VALUES (1, ?, ?, CURRENT_TIMESTAMP)",
      [cleanUser, cleanPass],
      function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        console.log(`Admin credentials updated. New username: ${cleanUser}`);
        res.json({ success: true, message: 'Username and password updated successfully.', username: cleanUser });
      }
    );
  });
});

// Bookings Endpoints
app.get('/api/bookings', (req, res) => {
  db.all("SELECT * FROM bookings ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/bookings', (req, res) => {
  const { 
    firstName, lastName, email, phone, 
    vehicleMake, vehicleModel, vehicleYear, 
    serviceType, preferredDate, preferredTime, 
    additionalNotes, attachedFileName 
  } = req.body;

  // Contact fields are mandatory on the database side
  if (!firstName || !lastName || !email || !phone) {
    return res.status(400).json({ error: 'Missing required contact fields (firstName, lastName, email, phone)' });
  }

  const query = `
    INSERT INTO bookings 
    (firstName, lastName, email, phone, vehicleMake, vehicleModel, vehicleYear, serviceType, preferredDate, preferredTime, additionalNotes, attachedFileName) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  // Format numeric values
  const formattedYear = vehicleYear ? parseInt(vehicleYear) : null;

  const params = [
    firstName, lastName, email, phone, 
    vehicleMake || null, 
    vehicleModel || null, 
    formattedYear, 
    serviceType || null, 
    preferredDate || null, 
    preferredTime || null, 
    additionalNotes || null, 
    attachedFileName || null
  ];

  db.run(query, params, function(err) {
    if (err) {
      console.error('SQLite booking insert failed:', err.message);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, id: this.lastID });
    }
  });
});

app.patch('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.run("UPDATE bookings SET status = ? WHERE id = ?", [status, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, changes: this.changes });
    }
  });
});

app.delete('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM bookings WHERE id = ?", [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, changes: this.changes });
    }
  });
});

// Reviews Endpoints
app.get('/api/reviews', (req, res) => {
  db.all("SELECT * FROM reviews ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/reviews', (req, res) => {
  const { name, vehicle, rating, quote, avatar, token } = req.body;

  if (!name || !vehicle || !rating || !quote) {
    return res.status(400).json({ error: 'Missing required review fields' });
  }

  // Token is mandatory for client review submissions to verify 1-time links
  if (!token) {
    return res.status(400).json({ error: 'Review submission requires a valid, one-time invite token.' });
  }

  // Validate the one-time invite token
  db.get("SELECT * FROM review_invites WHERE token = ? AND status = 'Pending'", [token], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(400).json({ error: 'This review invitation has already been used or is invalid.' });
    }

    // Process saving
    const placeholder = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%23E2E8F0'/><path d='M50,45 A15,15 0 1,0 50,15 A15,15 0 1,0 50,45 Z M20,80 C20,60 30,55 50,55 C70,55 80,60 80,80 Z' fill='%2394A3B8'/></svg>`;
    const finalAvatar = avatar || placeholder;

    // Categorize
    let category = 'suv';
    const vLower = vehicle.toLowerCase();
    if (vLower.includes('fleet') || vLower.includes('van') || vLower.includes('truck') || vLower.includes('commercial')) {
      category = 'fleet';
    } else if (vLower.includes('tune') || vLower.includes('ecu') || vLower.includes('dyno') || vLower.includes('remap')) {
      category = 'tuning';
    } else if (vLower.includes('4wd') || vLower.includes('patrol') || vLower.includes('offroad') || vLower.includes('hilux') || vLower.includes('prado')) {
      category = '4wd';
    }

    db.run(
      "INSERT INTO reviews (name, vehicle, rating, quote, avatar, category) VALUES (?, ?, ?, ?, ?, ?)",
      [name, vehicle, parseInt(rating), quote, finalAvatar, category],
      function(err2) {
        if (err2) {
          res.status(500).json({ error: err2.message });
        } else {
          // Toggle invitation token to Used
          db.run("UPDATE review_invites SET status = 'Used' WHERE token = ?", [token], (err3) => {
            if (err3) {
              console.error("Failed to mark token as used:", err3.message);
            }
            res.json({ success: true, id: this.lastID });
          });
        }
      }
    );
  });
});

app.delete('/api/reviews/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM reviews WHERE id = ?", [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, changes: this.changes });
    }
  });
});

// Review Invitations Endpoints
app.get('/api/invites/:token', (req, res) => {
  const { token } = req.params;
  db.get("SELECT * FROM review_invites WHERE token = ?", [token], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Invite link is invalid or not found.' });
    } else {
      res.json(row);
    }
  });
});

app.post('/api/invites', (req, res) => {
  const { name, vehicle } = req.body;
  if (!name || !vehicle) {
    return res.status(400).json({ error: 'Missing name or vehicle for review invite' });
  }

  // Generate unique token
  const token = 'invite_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  db.run("INSERT INTO review_invites (token, name, vehicle) VALUES (?, ?, ?)", [token, name, vehicle], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, token });
    }
  });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
});
