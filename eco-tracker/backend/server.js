const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// TEST ENDPOINT
app.get('/test', (req, res) => {
  res.send('Server is Live and Running Latest Code!');
});

// SMS via Exotel
const axios = require('axios');
async function sendSMS(to, message) {
  const sid = process.env.EXOTEL_SID;
  const apiKey = process.env.EXOTEL_API_KEY;
  const apiToken = process.env.EXOTEL_API_TOKEN;
  const from = process.env.EXOTEL_SMS_FROM;
  
  if (!sid || !apiKey || !apiToken) {
    console.log('⚠️ SMS skipped: Exotel credentials not configured');
    return;
  }
  
  try {
    const url = `https://api.exotel.com/v1/Accounts/${sid}/Sms/send`;
    await axios.post(url, new URLSearchParams({
      From: from,
      To: to,
      Body: message
    }).toString(), {
      auth: { username: apiKey, password: apiToken },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log(`📲 SMS sent to ${to}`);
  } catch (err) {
    console.log(`⚠️ SMS failed for ${to}:`, err.response?.data || err.message);
  }
}

// In-memory fallback (used if no DB is connected)
let reports = [];
let idCounter = 1;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;
let useSupabase = false;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  useSupabase = true;
  console.log('◇ Supabase connected successfully.');
}

// Database Connection Logic (Postgres / Mongo / Memory)
let useMongoDB = false;
let usePostgres = false;
let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      phone_number TEXT,
      resource_type TEXT,
      area TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).then(() => {
    console.log('Connected to PostgreSQL and table verified.');
    usePostgres = true;
  }).catch(err => console.error('PostgreSQL connection error:', err));
} else if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log('Connected to MongoDB');
      useMongoDB = true;
    })
    .catch(err => console.error('MongoDB connection error:', err));
} else if (!useSupabase) {
  console.log('No DB URI provided, using in-memory storage for MVP.');
}

// LOCAL AREA MAPPING (Dharwad Focus)
const PINCODE_MAP = {
  "580001": "Dharwad Central",
  "580002": "Vidyagiri",
  "580003": "Sattur",
  "580004": "Malamaddi",
  "580007": "SDM Campus",
  "580008": "Line Bazar"
};

function determineArea(phone_number, input_digits) {
  if (input_digits && input_digits.length === 6 && PINCODE_MAP[input_digits]) {
    return PINCODE_MAP[input_digits];
  }
  
  // Map Menu Choices to Areas
  const choice = input_digits ? input_digits.toString() : "";
  if (choice === "1") return "Vidyagiri";
  if (choice === "2") return "Sattur";
  if (choice === "3") return "Malamaddi";
  if (choice === "4") return "Line Bazar";

  return "Choice Pending...";
}

// USER PROFILE LOGIC
async function getUserProfile(phone_number) {
  if (!useSupabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('location')
    .eq('phone_number', phone_number)
    .single();
  if (error) return null;
  return data;
}

async function saveUserProfile(phone_number, profileData) {
  if (!useSupabase) return;
  const updateData = { phone_number };
  if (profileData.location) updateData.location = profileData.location;
  if (profileData.language) updateData.language = profileData.language;
  await supabase
    .from('user_profiles')
    .upsert(updateData);
}

async function saveReport(phone_number, resource_type, area) {
  const newReport = { phone_number, resource_type, area, timestamp: new Date() };
  
  if (useSupabase) {
    const { data, error } = await supabase
      .from('reports')
      .insert([{ phone_number, resource_type, area }])
      .select();
    if (error) console.error('Supabase insert error:', error);
    return data ? data[0] : null;
  } else if (usePostgres) {
    const res = await pool.query(
      'INSERT INTO reports (phone_number, resource_type, area) VALUES ($1, $2, $3) RETURNING *',
      [phone_number, resource_type, area]
    );
    return res.rows[0];
  } else {
    newReport.id = idCounter++;
    reports.push(newReport);
    return newReport;
  }
}

async function getAllReports() {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) console.error('Supabase fetch error:', error);
    return data || [];
  } else if (usePostgres) {
    const res = await pool.query('SELECT * FROM reports ORDER BY timestamp DESC LIMIT 100');
    return res.rows;
  } else {
    return [...reports].sort((a, b) => b.timestamp - a.timestamp);
  }
}

// API Endpoints
app.get('/logs', async (req, res) => {
  const data = await getAllReports();
  res.json(data);
});

app.get('/stats', async (req, res) => {
  const allReports = await getAllReports();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayReports = allReports.filter(r => new Date(r.timestamp || r.created_at) >= todayStart);

  const byType = todayReports.reduce((acc, r) => {
    acc[r.resource_type] = (acc[r.resource_type] || 0) + 1;
    return acc;
  }, {});

  // Clean corrupted area values
  const cleanArea = (area) => {
    if (!area || area === '0' || area === 'Choice Pending...' || area === 'Pending') return null;
    if (typeof area === 'object') return area.location || null;
    try { const parsed = JSON.parse(area); return parsed.location || null; } catch(e) {}
    return area;
  };

  const cleanedReports = todayReports.map(r => ({ ...r, area: cleanArea(r.area) })).filter(r => r.area);

  const byArea = cleanedReports.reduce((acc, r) => {
    acc[r.area] = (acc[r.area] || 0) + 1;
    return acc;
  }, {});

  const byAreaAndType = cleanedReports.reduce((acc, r) => {
    if (!acc[r.area]) acc[r.area] = { water: 0, electricity: 0, waste: 0 };
    acc[r.area][r.resource_type] = (acc[r.area][r.resource_type] || 0) + 1;
    return acc;
  }, {});

  const totalToday = todayReports.length;
  const percentages = {};
  const areaPercentages = {};
  if (totalToday > 0) {
    for (const [type, count] of Object.entries(byType)) {
      percentages[type] = ((count / totalToday) * 100).toFixed(1);
    }
    for (const [area, count] of Object.entries(byArea)) {
      areaPercentages[area] = ((count / totalToday) * 100).toFixed(1);
    }
  }

  const score = Math.max(0, 100 - (totalToday * 5));
  res.json({ score, totalToday, byType, byArea, byAreaAndType, percentages, areaPercentages });
});

app.get('/insights', async (req, res) => {
  const allReports = await getAllReports();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayReports = allReports.filter(r => new Date(r.timestamp || r.created_at).getTime() >= todayStart);
  
  const nudges = [];

  // 1. Check for Hotspots (Areas with >= 3 reports)
  const byArea = todayReports.reduce((acc, r) => { acc[r.area] = (acc[r.area] || 0) + 1; return acc; }, {});
  for (const [area, count] of Object.entries(byArea)) {
    if (count >= 3 && area !== "Choice Pending...") {
      nudges.push({ type: 'alert', text: `HOTSPOT: Multiple reports in ${area}.` });
    }
  }

  // 2. Resource Spike (More than 5 reports of one type)
  const byType = todayReports.reduce((acc, r) => { acc[r.resource_type] = (acc[r.resource_type] || 0) + 1; return acc; }, {});
  if (byType['water'] > 5) nudges.push({ type: 'warning', text: 'Water supply issues detected.' });
  if (byType['electricity'] > 5) nudges.push({ type: 'warning', text: 'Power outages being reported.' });

  // 3. Positive Nudge
  if (todayReports.length > 0 && nudges.length === 0) {
    nudges.push({ type: 'success', text: 'Active community monitoring in progress.' });
  }

  // Default
  if (nudges.length === 0) {
    nudges.push({ type: 'info', text: 'EcoTracker: System stable and monitoring.' });
  }

  res.json(nudges);
});

// WEBHOOKS

// Exotel branching: Check if user is known
app.all('/webhook/check-user', async (req, res) => {
  const data = req.method === 'POST' ? req.body : req.query;
  const phone = data.CallFrom || data.From;
  const profile = await getUserProfile(phone);
  
  if (profile) res.status(200).send('registered');
  else res.status(404).send('new');
});

// Unified Exotel handler
app.all('/webhook/exotel', async (req, res) => {
  const data = { ...req.query, ...req.body };
  console.log('--- Incoming Exotel Webhook ---');
  console.log('Step:', data.step || 'No Step');
  console.log('Digits Received:', data.digits || data.Digits || 'None');
  
  const phone = data.CallFrom || data.From;
  let digits = data.digits || data.Digits;
  if (digits) digits = digits.toString().replace(/"/g, '').trim();

  // Step 1: Save Language Choice
  if (data.step === 'language' || req.query.step === 'language') {
    const langMap = { "1": "kn", "2": "hi", "3": "en" };
    const lang = langMap[digits] || "en";
    await saveUserProfile(phone, { language: lang });
    console.log(`✅ Saved Language for ${phone}: ${lang}`);
    return res.send('success');
  }

  // Step 2: Save Location Choice
  if (data.step === 'location' || req.query.step === 'location') {
    const area = determineArea(phone, digits);
    await saveUserProfile(phone, { location: area });
    
    if (useSupabase) {
      const { data: latest } = await supabase
        .from('reports')
        .select('id')
        .eq('phone_number', phone)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (latest && latest.length > 0) {
        await supabase.from('reports').update({ area: area }).eq('id', latest[0].id);
      }
    }
    
    console.log(`✅ Updated Profile and Report for ${phone}: ${area}`);
    return res.send('success');
  }

  // Step 3: Save Report
  const profile = await getUserProfile(phone);
  const resource_type = digits === '1' ? 'water' : digits === '2' ? 'electricity' : 'waste';
  let area = "Choice Pending...";
  if (profile && profile.location) {
    area = typeof profile.location === 'object' ? profile.location.location || "Choice Pending..." : profile.location;
  }
  
  await saveReport(phone, resource_type, area);
  console.log(`✅ Logged Report for ${phone}: ${resource_type} (Area: ${area})`);

  // Send SMS confirmation
  const smsMessage = `EcoTracker: Your ${resource_type} complaint for ${area} has been registered. We are on it. Thank you for helping keep Dharwad clean!`;
  sendSMS(phone, smsMessage);

  res.send('success');
});

app.post('/webhook/call', (req, res) => {
  const responseXml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather action="/webhook/process" numDigits="1"><Say>Press 1 for water, 2 for power, 3 for waste.</Say></Gather></Response>`;
  res.type('text/xml').send(responseXml);
});

app.post('/webhook/process', async (req, res) => {
  const { From, Digits } = req.body;
  const type = Digits === '1' ? 'water' : Digits === '2' ? 'electricity' : 'waste';
  await saveReport(From, type, determineArea(From));
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Logged.</Say></Response>`);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
