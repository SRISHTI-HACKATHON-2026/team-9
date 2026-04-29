import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { Droplet, Zap, Trash2, PhoneCall, AlertTriangle, TrendingDown, TrendingUp, Info, Activity, MapPin, Shield, Lock, Mail, Key, ArrowRight, UserPlus, LogOut, Smartphone, MessageSquare } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const API_BASE_URL = 'http://localhost:3002';

// Supabase Initialization (Hardcoded for hackathon speed, should use env in production)
const supabaseUrl = 'https://gajnmbgelmpljtbjvhoc.supabase.co';
const supabaseKey = 'sb_publishable_tdDYl42zvN_B0gfk-y7i8w_Q8PlEJXs';
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_EMAIL = 'sanjeevkumarnadgir@gmail.com';


interface StatsData {
  score: number;
  totalToday: number;
  byType: Record<string, number>;
  byArea: Record<string, number>;
  byAreaAndType: Record<string, Record<string, number>>;
  byIntent: { need: number; waste: number };
  byAreaAndIntent: Record<string, { need: number; waste: number }>;
  percentages: Record<string, string>;
  areaPercentages: Record<string, string>;
}

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMsg, setAuthMsg] = useState('');

  const [stats, setStats] = useState<StatsData>({ 
    score: 100, totalToday: 0, byType: {}, byArea: {}, 
    byAreaAndType: {}, byIntent: { need: 0, waste: 0 }, byAreaAndIntent: {},
    percentages: {}, areaPercentages: {} 
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [simIntent, setSimIntent] = useState<'need' | 'waste'>('waste');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [latestSms, setLatestSms] = useState<{phone: string, text: string, time: string} | null>(null);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, logsRes, insightsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/stats`),
        axios.get(`${API_BASE_URL}/logs`),
        axios.get(`${API_BASE_URL}/insights`)
      ]);
      setStats(statsRes.data);
      setLogs(logsRes.data);
      setInsights(insightsRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    
    // 1-second sync for high-impact demo
    const interval = setInterval(fetchData, 1000);
    
    // SUPABASE REALTIME MAGIC 🚀
    const channel = supabase
      .channel('public:reports')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload) => {
        console.log('Realtime report received!', payload);
        fetchData(); 
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const simulateReport = async (type: string) => {
    setSimulating(true);
    try {
      // 1. Save intent choice first (to simulate the IVR flow)
      await axios.get(`${API_BASE_URL}/webhook/exotel`, {
        params: {
          From: '09611103853',
          Digits: simIntent === 'need' ? '1' : '2',
          step: 'intent'
        }
      });

      // 2. Then save the resource report
      await axios.get(`${API_BASE_URL}/webhook/exotel`, {
        params: {
          From: '09611103853',
          Digits: type === 'water' ? '1' : (type === 'electricity' ? '2' : '3'),
          // No step parameter triggers the final report save
        }
      });

      // 3. IMMEDIATE REFRESH
      await fetchData();
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Simulation failed:', error);
    } finally {
      setSimulating(false);
    }
  };

  const resolveAndCall = async (log: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}/resolve-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: log.id || log._id,
          phone_number: log.phone_number,
          area: log.area,
          resource_type: log.resource_type
        })
      });
      if (response.ok) {
        alert(`📞 Calling ${log.phone_number}... \n"Your ${log.resource_type} report for ${log.area} has been resolved!"`);
        await fetchData();
      }
    } catch (error) {
      console.error('Resolution error:', error);
    }
  };

  const getIconForType = (type: string) => {
    if (type === 'water') return <Droplet className="w-4 h-4 text-blue-400" />;
    if (type === 'electricity') return <Zap className="w-4 h-4 text-amber-400" />;
    if (type === 'waste') return <Trash2 className="w-4 h-4 text-emerald-400" />;
    return <PhoneCall className="w-4 h-4 text-slate-400" />;
  };

  const getInsightIcon = (type: string) => {
    if (type === 'warning') return <TrendingUp className="w-4 h-4 text-red-400" />;
    if (type === 'success') return <TrendingDown className="w-4 h-4 text-emerald-400" />;
    if (type === 'alert') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    return <Info className="w-4 h-4 text-blue-400" />;
  };

  const getInsightBg = (type: string) => {
    if (type === 'alert') return 'border-red-500/20 bg-red-500/5';
    if (type === 'warning') return 'border-amber-500/20 bg-amber-500/5';
    if (type === 'success') return 'border-emerald-500/20 bg-emerald-500/5';
    return 'border-blue-500/20 bg-blue-500/5';
  };

  // Prepare stacked chart data for Area distribution
  const areaData = Object.entries(stats.byAreaAndIntent || {}).map(([name, intents]) => ({
    name: name,
    need: intents.need || 0,
    waste: intents.waste || 0,
  }));

  // Donut chart data
  const donutData = [
    { name: 'Water', value: stats.byType?.water || 0, color: '#3b82f6', pct: stats.percentages?.water || '0' },
    { name: 'Power', value: stats.byType?.electricity || 0, color: '#f59e0b', pct: stats.percentages?.electricity || '0' },
    { name: 'Waste', value: stats.byType?.waste || 0, color: '#10b981', pct: stats.percentages?.waste || '0' },
  ].filter(d => d.value > 0);

  // Custom tooltip for bar chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div style={{ background: 'rgba(2,6,23,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(51,65,85,0.5)', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>{label}</p>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', padding: '2px 0' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: entry.color, flexShrink: 0 }}></span>
            <span style={{ color: '#94a3b8' }}>{entry.name}</span>
            <span style={{ color: '#fff', fontWeight: 600, marginLeft: 'auto' }}>{entry.value}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #1e293b', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
          <span style={{ color: '#64748b' }}>Total</span>
          <span style={{ color: '#fff', fontWeight: 700 }}>{payload.reduce((s: number, p: any) => s + p.value, 0)}</span>
        </div>
      </div>
    );
  };

  // Score SVG ring
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMsg('');

    if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      setAuthError(`Unauthorized. Only ${ADMIN_EMAIL} can access this dashboard.`);
      return;
    }

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setAuthMsg('Check your email for confirmation!');
      } else if (authMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setAuthMsg('Reset link sent to your email!');
      }
    } catch (err: any) { setAuthError(err.message); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen bg-slate-950 bg-grid flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-900/60 backdrop-blur-2xl rounded-3xl p-8 border border-slate-800/60 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500"></div>
          
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight text-center">EcoTracker</h1>
            <p className="text-slate-400 text-sm mt-1">Admin Dashboard Login</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-emerald-500/50" />
              </div>
            </div>
            {authMode !== 'forgot' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase">Password</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
            )}
            {authError && <div className="text-red-400 text-xs py-2 px-4 rounded-lg bg-red-500/10 border border-red-500/20">{authError}</div>}
            {authMsg && <div className="text-emerald-400 text-xs py-2 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">{authMsg}</div>}
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
              {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Sign Up' : 'Reset Password'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800/50 flex flex-col gap-3 text-center">
            {authMode === 'login' ? (
              <>
                <button onClick={() => setAuthMode('forgot')} className="text-xs text-slate-500 hover:text-emerald-400 transition-colors">Forgot password?</button>
                <button onClick={() => setAuthMode('signup')} className="text-xs text-slate-400 hover:text-white transition-colors">No account? Sign up</button>
              </>
            ) : (
              <button onClick={() => setAuthMode('login')} className="text-xs text-slate-400 hover:text-white transition-colors">Back to Login</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const scorePercent = stats.score;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (scorePercent / 100) * circumference;
  const scoreColor = scorePercent > 80 ? '#34d399' : scorePercent > 50 ? '#fbbf24' : '#f87171';

  return (

    <div className="min-h-screen bg-slate-950 bg-grid text-slate-200 p-4 md:p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        
        {/* ─── Header ─── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400">
                  EcoTracker
                </span>
                <span className="text-slate-400 font-normal ml-2 text-lg">Dashboard</span>
              </h1>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Monitoring
                </span>
                <span className="text-xs text-slate-600">•</span>
                <span className="text-xs text-slate-500">
                  Updated {lastUpdated.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
            
            <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-xl p-1.5 rounded-xl border border-slate-800">
              <div className="flex bg-slate-950/50 p-1 rounded-lg border border-slate-800 mr-2">
                <button 
                  onClick={() => setSimIntent('waste')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${simIntent === 'waste' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  WASTE
                </button>
                <button 
                  onClick={() => setSimIntent('need')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${simIntent === 'need' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  NEED
                </button>
              </div>
              
              <span className="text-xs font-medium text-slate-500 px-2 hidden sm:block">Test:</span>
            <button onClick={() => simulateReport('water')} disabled={simulating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 disabled:opacity-50">
              <Droplet className="w-3.5 h-3.5" /> Water
            </button>
            <button onClick={() => simulateReport('electricity')} disabled={simulating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/40 disabled:opacity-50">
              <Zap className="w-3.5 h-3.5" /> Power
            </button>
            <button onClick={() => simulateReport('waste')} disabled={simulating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> Waste
            </button>
          </div>
        </div>
      </div>

        {/* ─── Stats Cards ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Score Card with Ring */}
          <div className="card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-5 border border-slate-800/60 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"></div>
            <h3 className="text-slate-500 font-medium text-xs uppercase tracking-wider mb-3">Impact Score</h3>
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#1e293b" strokeWidth="8" />
                <circle cx="60" cy="60" r="54" fill="none" stroke={scoreColor} strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  className="score-ring" style={{ filter: `drop-shadow(0 0 6px ${scoreColor}40)` }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold tabular-nums" style={{ color: scoreColor }}>{stats.score}</span>
                <span className="text-[10px] text-slate-500 font-medium">/ 100</span>
              </div>
            </div>
          </div>

          {/* Water Card */}
          <div className="card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-5 border border-slate-800/60 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent"></div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-500 font-medium text-xs uppercase tracking-wider">Water</h3>
              <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <Droplet className="w-4 h-4 text-blue-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold text-white tabular-nums">{stats.byType?.water || 0}</span>
              <span className="text-sm font-semibold text-blue-400">{stats.percentages?.water || 0}%</span>
            </div>
            <p className="text-[10px] text-slate-600 mb-3">reports today</p>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full transition-all duration-700 ease-out" 
                style={{ width: `${stats.percentages?.water || 0}%`, boxShadow: '0 0 12px rgba(59,130,246,0.4)' }}></div>
            </div>
          </div>

          {/* Electricity Card */}
          <div className="card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-5 border border-slate-800/60 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-500 font-medium text-xs uppercase tracking-wider">Power</h3>
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold text-white tabular-nums">{stats.byType?.electricity || 0}</span>
              <span className="text-sm font-semibold text-amber-400">{stats.percentages?.electricity || 0}%</span>
            </div>
            <p className="text-[10px] text-slate-600 mb-3">reports today</p>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-700 ease-out" 
                style={{ width: `${stats.percentages?.electricity || 0}%`, boxShadow: '0 0 12px rgba(245,158,11,0.4)' }}></div>
            </div>
          </div>

          {/* Waste Card */}
          <div className="card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-5 border border-slate-800/60 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"></div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-500 font-medium text-xs uppercase tracking-wider">Garbage</h3>
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Trash2 className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold text-white tabular-nums">{stats.byType?.waste || 0}</span>
              <span className="text-sm font-semibold text-emerald-400">{stats.percentages?.waste || 0}%</span>
            </div>
            <p className="text-[10px] text-slate-600 mb-3">reports today</p>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-700 ease-out" 
                style={{ width: `${stats.percentages?.waste || 0}%`, boxShadow: '0 0 12px rgba(16,185,129,0.4)' }}></div>
            </div>
          </div>
        </div>

        {/* ─── Main Content Grid ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Stacked Area Chart */}
          <div className="lg:col-span-2 card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-800/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"></div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <h3 className="text-slate-300 font-semibold text-sm">Area Breakdown</h3>
              </div>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1.5"><span className="legend-dot" style={{background:'#f59e0b'}}></span><span className="text-slate-400">Need</span></span>
                <span className="flex items-center gap-1.5"><span className="legend-dot" style={{background:'#10b981'}}></span><span className="text-slate-400">Waste</span></span>
              </div>
            </div>

            <div className="flex gap-6 h-72">
              {/* Bar Chart */}
              <div className="flex-1">
                {areaData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={areaData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(51, 65, 85, 0.2)'}} />
                    <Bar dataKey="need" name="Shortage" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} barSize={32} />
                    <Bar dataKey="waste" name="Excess" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                    <Activity className="w-8 h-8 text-slate-700" />
                    <span className="text-sm">Waiting for reports...</span>
                  </div>
                )}
              </div>

              {/* Donut Chart */}
              <div className="w-48 flex flex-col items-center justify-center">
                {donutData.length > 0 ? (
                  <>
                    <div className="relative">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={donutData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                            paddingAngle={4} dataKey="value" stroke="none" animationBegin={200} animationDuration={800}>
                            {donutData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} style={{ filter: `drop-shadow(0 0 4px ${entry.color}50)` }} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-white tabular-nums">{stats.totalToday}</span>
                        <span className="text-[9px] text-slate-500 font-medium">TOTAL</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-2 w-full">
                      {donutData.map((d, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs px-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm" style={{ background: d.color }}></span>
                            <span className="text-slate-400">{d.name}</span>
                          </div>
                          <span className="text-slate-300 font-semibold tabular-nums">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-600 text-xs text-center">No data</div>
                )}
              </div>
            </div>
          </div>

          {/* Insights Panel */}
          <div className="card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-800/60 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"></div>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-purple-400" />
              <h3 className="text-slate-300 font-semibold text-sm">AI Insights</h3>
              <span className="ml-auto text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">Live</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
              {insights.map((insight, idx) => (
                <div key={idx} className={`flex gap-3 p-3 rounded-xl border transition-all duration-200 hover:scale-[1.01] ${getInsightBg(insight.type)}`}>
                  <div className="mt-0.5 flex-shrink-0">{getInsightIcon(insight.type)}</div>
                  <p className="text-slate-300 text-xs leading-relaxed">{insight.text}</p>
                </div>
              ))}
              {insights.length === 0 && (
                <div className="text-slate-600 text-xs text-center mt-10 flex flex-col items-center gap-2">
                  <div className="shimmer w-full h-8 rounded-lg"></div>
                  <div className="shimmer w-3/4 h-8 rounded-lg"></div>
                  <span className="mt-2">Analyzing patterns...</span>
                </div>
              )}
            </div>

            {/* Summary Stats */}
            <div className="mt-4 pt-4 border-t border-slate-800/60 grid grid-cols-2 gap-3">
              <div className="bg-slate-950/60 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-white tabular-nums">{stats.totalToday}</div>
                <div className="text-[10px] text-slate-500">Total Today</div>
              </div>
              <div className="bg-slate-950/60 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-white tabular-nums">{Object.keys(stats.byArea || {}).length}</div>
                <div className="text-[10px] text-slate-500">Active Areas</div>
              </div>
            </div>
          </div>

          {/* Virtual Phone SMS Simulator (Hackathon Special) */}
          <div className="card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-4 border border-slate-800/60 flex flex-col relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <h3 className="text-white font-semibold text-sm">Virtual Phone</h3>
            </div>
            
            <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-3 flex flex-col relative">
              {/* Phone Header */}
              <div className="flex justify-between items-center pb-3 border-b border-slate-800/50 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <MessageSquare className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-xs text-slate-300 font-medium">EcoTracker SMS</span>
                </div>
              </div>

              {/* SMS Bubble */}
              <div className="flex-1 overflow-y-auto flex flex-col justify-end gap-3 pb-2">
                {latestSms ? (
                  <div className="bg-slate-800/80 rounded-2xl rounded-tl-sm p-3 border border-slate-700/50 shadow-lg" style={{ animation: 'slideUp 0.3s ease-out' }}>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{latestSms.text}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[9px] text-slate-500">{latestSms.time}</span>
                      <span className="text-[9px] text-emerald-500 font-medium">{latestSms.phone.substring(0,6)}****</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full opacity-50 pb-6">
                    <MessageSquare className="w-6 h-6 text-slate-600 mb-2" />
                    <span className="text-[10px] text-slate-500 text-center leading-relaxed">Waiting for live call...<br/>SMS will appear here instantly.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ─── Live Feed ─── */}
        <div className="card-glow bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-800/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500/40 to-transparent"></div>
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="w-2 h-2 rounded-full bg-rose-500 block"></span>
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              </div>
              <h3 className="text-slate-300 font-semibold text-sm">Live Activity Feed</h3>
            </div>
            <span className="text-[10px] font-medium bg-slate-800 text-slate-400 px-2.5 py-1 rounded-lg border border-slate-700/50 tabular-nums">
              {logs.length} reports
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
            {logs.map((log, idx) => (
              <div key={log.id || log._id || idx} className="feed-item flex items-start gap-3 bg-slate-950/50 rounded-xl p-3.5 border border-slate-800/40 hover:border-slate-700/60 transition-all duration-200">
                <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/30 flex-shrink-0">
                  {getIconForType(log.resource_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-medium text-slate-200 text-xs capitalize">{log.resource_type}</span>
                    <span className="text-[10px] text-slate-600 tabular-nums flex-shrink-0">
                      {new Date(log.timestamp || log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" /> {log.area}
                    </span>
                    <span className="text-[10px] text-slate-600 flex items-center gap-1 flex-shrink-0">
                      <PhoneCall className="w-2.5 h-2.5"/> {log.phone_number?.replace(/\d{4}$/, '****')}
                    </span>
                  </div>
                </div>
                
                {/* Resolve & Call Button */}
                <button 
                  onClick={() => resolveAndCall(log)}
                  disabled={log.status === 'resolved'}
                  className={`flex-shrink-0 p-2 rounded-lg transition-all border ${
                    log.status === 'resolved' 
                    ? 'bg-slate-900 text-slate-700 border-slate-800 cursor-not-allowed' 
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500 hover:text-white'
                  }`}
                  title="Resolve and send Voice Update Call"
                >
                  <Activity className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="col-span-full text-slate-600 text-sm text-center py-12 flex flex-col items-center gap-2">
                <PhoneCall className="w-8 h-8 text-slate-700" />
                <span>No reports received yet. Make a call!</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="text-center pb-4">
          <p className="text-[10px] text-slate-700">
            EcoTracker • Built for SRISHTI Hackathon 2026 • Powered by IVR + Supabase
          </p>
        </div>

      </div>
    </div>
  );
}

export default App;
