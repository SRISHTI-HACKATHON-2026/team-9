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
const EXOTEL_SID = process.env.EXOTEL_SID;
const EXOTEL_TOKEN = process.env.EXOTEL_API_TOKEN;
const EXOTEL_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_VIRTUAL_NUMBER = process.env.EXOTEL_SMS_FROM || '08047104921';

// Function to trigger an outbound "Update" call via Exotel
async function triggerExotelCall(toPhone, area, resource) {
  console.log(`📡 [Exotel] Attempting Call to: ${toPhone}...`);
  try {
    const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect.json`;
    const params = new URLSearchParams();
    
    // NEW ATTEMPT: Swapping From/To (Some Exotel accounts require this)
    params.append('From', EXOTEL_VIRTUAL_NUMBER); 
    params.append('To', toPhone);
    params.append('CallerId', EXOTEL_VIRTUAL_NUMBER);
    params.append('Url', `${process.env.NGROK_URL}/webhook/status-update?area=${encodeURIComponent(area)}&resource=${encodeURIComponent(resource)}`);

    const response = await axios.post(url, params, {
      auth: { username: EXOTEL_KEY, password: EXOTEL_TOKEN }
    });
    console.log(`✅ [Exotel] Call Queued! SID: ${response.data.Call?.Sid}`);
    return response.data;
  } catch (error) {
    console.error('❌ [Exotel] Failed. Switching to backup...');
    return null;
  }
}

// BACKUP: Function to trigger an outbound call via Twilio
async function triggerTwilioCall(toPhone, area, resource) {
  // CLEAN PHONE NUMBER FOR TWILIO (+91 format)
  let cleanPhone = toPhone.toString().trim();
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = `+91${cleanPhone.replace(/^0/, '')}`;
  }
  
  console.log(`📡 [Twilio] Attempting Call to: ${cleanPhone}...`);
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;
    const params = new URLSearchParams();
    params.append('To', cleanPhone);
    params.append('From', from);
    params.append('Url', `${process.env.NGROK_URL}/webhook/status-update?area=${encodeURIComponent(area)}&resource=${encodeURIComponent(resource)}`);

    const response = await axios.post(url, params, {
      auth: { username: sid, password: token }
    });
    console.log(`✅ [Twilio] Call successfully queued! SID: ${response.data.sid}`);
    return response.data;
  } catch (error) {
    console.error('❌ [Twilio] Call Failed:', error.response?.data?.message || error.message);
    return null;
  }
}

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
    .select('*') // Select ALL fields including intent
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
  if (profileData.intent) updateData.intent = profileData.intent; // Save intent!
  await supabase
    .from('user_profiles')
    .upsert(updateData);
}

async function saveReport(phone_number, resource_type, area, intent = 'waste') {
  const newReport = { phone_number, resource_type, area, intent, timestamp: new Date() };

  if (useSupabase) {
    const { data, error } = await supabase
      .from('reports')
      .insert([{ phone_number, resource_type, area, intent }])
      .select();
    if (error) console.error('Supabase insert error:', error);
    return data ? data[0] : null;
  } else if (usePostgres) {
    const res = await pool.query(
      'INSERT INTO reports (phone_number, resource_type, area, intent) VALUES ($1, $2, $3, $4) RETURNING *',
      [phone_number, resource_type, area, intent]
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

  const byIntent = todayReports.reduce((acc, r) => {
    const intent = r.intent || 'waste';
    acc[intent] = (acc[intent] || 0) + 1;
    return acc;
  }, { need: 0, waste: 0 });

  // Clean corrupted area values
  const cleanArea = (area) => {
    if (!area || area === '0' || area === 'Choice Pending...' || area === 'Pending') return null;
    if (typeof area === 'object') return area.location || null;
    try { const parsed = JSON.parse(area); return parsed.location || null; } catch (e) { }
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

  // NEW: Group by Area and Intent for advanced visualization
  const byAreaAndIntent = cleanedReports.reduce((acc, r) => {
    if (!acc[r.area]) acc[r.area] = { need: 0, waste: 0 };
    const intent = r.intent || 'waste';
    acc[r.area][intent] = (acc[r.area][intent] || 0) + 1;
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
  res.json({
    score, totalToday, byType, byArea,
    byAreaAndType, byIntent, byAreaAndIntent,
    percentages, areaPercentages
  });
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

// Exotel branching: Check if user is known & provide instant feedback loop
app.all('/webhook/check-user', async (req, res) => {
  const data = req.method === 'POST' ? req.body : req.query;
  const phone = data.CallFrom || data.From;
  const profile = await getUserProfile(phone);

  if (profile) {
    // FETCH HISTORY FOR START-OF-CALL FEEDBACK
    const allReports = await getAllReports();
    const userCount = allReports.filter(r => r.phone_number === phone).length;
    const lang = profile.language || 'en';

    let welcomeMsg = "";
    if (lang === 'kn') {
      welcomeMsg = `ಪುನಃ ಸ್ವಾಗತ! ನೀವು ಈಗಾಗಲೇ ${userCount} ವರದಿಗಳನ್ನು ನೀಡಿದ್ದೀರಿ. ಧನ್ಯವಾದಗಳು.`;
    } else if (lang === 'hi') {
      welcomeMsg = `वापस स्वागत है! आप पहले ही ${userCount} रिपोर्ट दर्ज कर चुके हैं। धन्यवाद।`;
    } else {
      welcomeMsg = `Welcome back! You have already contributed ${userCount} reports to Dharwad. Thank you for your help.`;
    }

    // Return 200 OK but also include the Voice XML
    res.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${welcomeMsg}</Say></Response>`);
  } else {
    // New user - just return 404 to trigger the "Location" branch in Exotel
    res.status(404).send('new');
  }
});

// Unified Exotel handler
app.all('/webhook/exotel', async (req, res) => {
  const data = { ...req.query, ...req.body };
  console.log('--- Incoming Exotel Webhook ---');
  console.log('Step:', data.step || 'No Step');
  console.log('Digits Received:', data.digits || data.Digits || 'None');

  const phone = data.CallFrom || data.From;

  // HYPER-SENSITIVE DIGIT CATCHER
  let digits = data.digits || data.Digits || data.dtmf || data.current_dtmf || data.DigitsReceived;
  if (digits) {
    digits = digits.toString().replace(/"/g, '').trim();
    console.log(`🎯 Hyper-Catch: Digits = [${digits}] for Phone = [${phone}]`);
  } else {
    console.log(`⚠️ Warning: No digits detected in this request from ${phone}`);
  }

  // Step 1: Save Language Choice
  if (data.step === 'language' || req.query.step === 'language') {
    const langMap = { "1": "kn", "2": "hi", "3": "en" };
    const lang = langMap[digits] || "en";
    await saveUserProfile(phone, { language: lang });
    console.log(`✅ Saved Language for ${phone}: ${lang}`);

    // ADDING DYNAMIC FEEDBACK LOOP HERE (So you don't have to rebuild Exotel flow!)
    const allReports = await getAllReports();
    const userCount = allReports.filter(r => r.phone_number === phone).length;
    
    let welcomeMsg = "";
    if (userCount > 0) {
      if (lang === 'kn') {
        welcomeMsg = `ಧನ್ಯವಾದಗಳು. ನೀವು ಈಗಾಗಲೇ ${userCount} ಬಾರಿ ವರದಿ ಮಾಡಿದ್ದೀರಿ.`;
      } else if (lang === 'hi') {
        welcomeMsg = `धन्यवाद। आप पहले ही ${userCount} बार रिपोर्ट कर चुके हैं।`;
      } else {
        welcomeMsg = `Thank you. You have already contributed ${userCount} reports to the community.`;
      }
      // Return voice XML - Exotel will play this and then continue the visual flow!
      return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${welcomeMsg}</Say></Response>`);
    }

    return res.send('success');
  }

  // Step 2: Save Location Choice
  if (data.step === 'location' || req.query.step === 'location') {
    const area = determineArea(phone, digits);
    await saveUserProfile(phone, { location: area });
    console.log(`✅ Saved Location for ${phone}: ${area}`);

    // RETROACTIVE FIX: Update any "Choice Pending" reports from today for this user
    if (useSupabase && area !== "Choice Pending...") {
      const today = new Date().toISOString().split('T')[0];
      const { data: pendingReports } = await supabase
        .from('reports')
        .select('id')
        .eq('phone_number', phone)
        .eq('area', 'Choice Pending...')
        .gte('created_at', today);

      if (pendingReports && pendingReports.length > 0) {
        const ids = pendingReports.map(r => r.id);
        await supabase.from('reports').update({ area: area }).in('id', ids);
        console.log(`✨ Retroactively updated ${ids.length} pending reports to ${area}`);
      }
    }
    return res.send('success');
  }

  // NEW: Step 2.5: Save Intent Choice (Need vs Waste)
  if (data.step === 'intent' || req.query.step === 'intent') {
    const intent = (digits === '1') ? 'need' : 'waste';
    await saveUserProfile(phone, { intent: intent });
    console.log(`✅ Saved Intent for ${phone}: ${intent}`);
    return res.send('success'); // STOP HERE
  }

  // Step 3: Save Report & Provide Feedback (Runs only if no other step matched)
  const profile = await getUserProfile(phone);
  
  // Robust Mapping for Resource Type
  const resourceMap = { "1": "water", "2": "electricity", "3": "waste" };
  const resource_type = resourceMap[digits] || "waste";
  const lang = profile?.language || 'en';
  const intent = profile?.intent || 'waste';
  
  let area = "Choice Pending...";
  if (profile && profile.location) {
    area = typeof profile.location === 'object' ? profile.location.location || "Choice Pending..." : profile.location;
  }

  // Save the report first
  await saveReport(phone, resource_type, area, intent);

  // Fetch actual count for feedback
  const allReports = await getAllReports();
  const count = allReports.filter(r => r.phone_number === phone).length;
  
  console.log(`✅ Logged Report for ${phone}: ${resource_type} (Count: ${count})`);

  // Build a much richer feedback message
  let feedbackMsg = "";
  if (lang === 'kn') {
    feedbackMsg = `ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ${area} ವಲಯದ ${resource_type} ವರದಿಯನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ. ಇದು ನಿಮ್ಮ ${count}ನೇ ವರದಿ.`;
  } else if (lang === 'hi') {
    feedbackMsg = `धन्यवाद। ${area} क्षेत्र के लिए आपकी ${resource_type} रिपोर्ट दर्ज कर ली गई है। यह आपकी ${count}वीं रिपोर्ट है।`;
  } else {
    feedbackMsg = `Thank you. Your ${resource_type} report for ${area} has been recorded. This is your report number ${count}. Well done!`;
  }

  // Return XML with a slight pause for better clarity
  const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Pause length="1"/>
    <Say voice="alice" language="${lang === 'en' ? 'en-US' : (lang === 'hi' ? 'hi-IN' : 'en-IN')}">${feedbackMsg}</Say>
    <Pause length="1"/>
</Response>`;

  res.type('text/xml').send(xmlResponse);

  // Send SMS confirmation (Async - will appear on virtual phone)
  const smsMessage = `EcoTracker: Your ${resource_type} report for ${area} is registered (Total: ${count}). Keep it up!`;
  sendSMS(phone, smsMessage);
});

// REST Endpoint for Frontend Simulation Buttons
app.post('/report', async (req, res) => {
  try {
    const { phone_number, resource_type, area = "Vidyagiri", intent = "waste" } = req.body;
    const report = await saveReport(phone_number, resource_type, area, intent);
    res.status(201).json(report);
  } catch (error) {
    console.error("Simulation error:", error);
    res.status(500).json({ error: "Failed to save report" });
  }
});

// Endpoint for Admin Dashboard to "Resolve" and call the citizen via Twilio
app.post('/resolve-report', async (req, res) => {
  let { reportId, phone_number, area, resource_type } = req.body;
  console.log(`🧹 Resolving report ${reportId} and calling user ${phone_number} via Twilio...`);

  // Ensure E.164 format for Twilio (+91...)
  if (phone_number && !phone_number.startsWith('+')) {
    phone_number = `+91${phone_number.replace(/^0/, '')}`;
  }

  // 1. Mark as resolved in Supabase
  if (useSupabase) {
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
  }

  // 2. Trigger the automated Twilio call
  const callResult = await triggerTwilioCall(phone_number, area, resource_type);
  
  res.json({ 
    success: !!callResult, 
    message: callResult ? 'Twilio call triggered' : 'Twilio call failed', 
    callResult 
  });
});

// Voice XML for the automated update call
app.all('/webhook/status-update', (req, res) => {
  const data = { ...req.query, ...req.body };
  const area = data.area || 'your area';
  const resource = data.resource || 'resource';

  const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Pause length="2"/>
    <Say voice="alice">Hello! This is an automated update from Eco Tracker Dharwad. We are happy to inform you that your report regarding ${resource} in ${area} has been successfully resolved. Thank you for being a responsible citizen and helping us improve our city. Have a great day!</Say>
    <Pause length="1"/>
</Response>`;

  res.type('text/xml').send(xmlResponse);
});

app.post('/webhook/call', (req, res) => {
  const responseXml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather action="/webhook/process" numDigits="1"><Say>Press 1 for water, 2 for power, 3 for waste.</Say></Gather></Response>`;
  res.type('text/xml').send(responseXml);
});

app.post('/webhook/process', async (req, res) => {
  const { From, Digits } = req.body;
  let digits = Digits ? Digits.toString().replace(/"/g, '').trim() : '';

  let type = 'waste';
  if (digits === '1') type = 'water';
  else if (digits === '2') type = 'electricity';
  else type = 'waste';

  console.log(`📡 Webhook Process: Digits [${digits}] -> Type [${type}]`);
  await saveReport(From, type, determineArea(From, digits));
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Logged.</Say></Response>`);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
