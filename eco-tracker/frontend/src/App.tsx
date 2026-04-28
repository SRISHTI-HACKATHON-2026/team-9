import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Droplet, Zap, Trash2, PhoneCall, AlertTriangle, TrendingDown, TrendingUp, Info } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3001';

interface StatsData {
  score: number;
  totalToday: number;
  byType: Record<string, number>;
  byArea: Record<string, number>;
}

function App() {
  const [stats, setStats] = useState<StatsData>({ score: 100, totalToday: 0, byType: {}, byArea: {} });
  const [logs, setLogs] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [simulating, setSimulating] = useState(false);

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
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const simulateReport = async (type) => {
    setSimulating(true);
    try {
      const randomPhone = `+91987654${Math.floor(1000 + Math.random() * 9000)}`;
      await axios.post(`${API_BASE_URL}/report`, {
        phone_number: randomPhone,
        resource_type: type
      });
      await fetchData();
    } catch (err) {
      console.error('Error simulating report', err);
    }
    setSimulating(false);
  };

  const getIconForType = (type) => {
    if (type === 'water') return <Droplet className="w-5 h-5 text-blue-500" />;
    if (type === 'electricity') return <Zap className="w-5 h-5 text-yellow-500" />;
    if (type === 'waste') return <Trash2 className="w-5 h-5 text-green-500" />;
    return <PhoneCall className="w-5 h-5 text-gray-500" />;
  };

  const getInsightIcon = (type) => {
    if (type === 'warning') return <TrendingUp className="w-5 h-5 text-red-500" />;
    if (type === 'success') return <TrendingDown className="w-5 h-5 text-emerald-500" />;
    if (type === 'alert') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    return <Info className="w-5 h-5 text-blue-500" />;
  };

  // Prepare data for charts
  const areaData = Object.entries(stats.byArea).map(([name, value]) => ({ name, value }));
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
              EcoTracker Community Dashboard
            </h1>
            <p className="text-slate-400 mt-1">Real-time resource waste tracking via IVR.</p>
          </div>
          
          {/* Simulator Actions */}
          <div className="flex gap-3 bg-slate-800 p-2 rounded-xl border border-slate-700 shadow-xl">
            <span className="text-sm font-medium text-slate-400 px-2 flex items-center">Simulate Call:</span>
            <button 
              onClick={() => simulateReport('water')} 
              disabled={simulating}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors text-sm font-medium border border-blue-500/20"
            >
              <Droplet className="w-4 h-4" /> Water
            </button>
            <button 
              onClick={() => simulateReport('electricity')}
              disabled={simulating}
              className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg transition-colors text-sm font-medium border border-yellow-500/20"
            >
              <Zap className="w-4 h-4" /> Electricity
            </button>
            <button 
              onClick={() => simulateReport('waste')}
              disabled={simulating}
              className="flex items-center gap-2 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors text-sm font-medium border border-green-500/20"
            >
              <Trash2 className="w-4 h-4" /> Garbage
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Stats & Breakdown */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Top Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              
              {/* Score Card */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl flex flex-col justify-center items-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <h3 className="text-slate-400 font-medium text-sm mb-2">Daily Impact Score</h3>
                <div className="flex items-baseline gap-1">
                  <span className={`text-5xl font-bold ${stats.score > 80 ? 'text-emerald-400' : stats.score > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {stats.score}
                  </span>
                  <span className="text-slate-500">/100</span>
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center">Higher is better. Drops as waste reports increase.</p>
              </div>

               {/* Water Stats */}
               <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-slate-400 font-medium text-sm">Water Waste</h3>
                  <div className="p-2 bg-blue-500/10 rounded-lg"><Droplet className="w-5 h-5 text-blue-400" /></div>
                </div>
                <div className="text-3xl font-bold text-slate-200">{stats.byType?.water || 0}</div>
                <p className="text-xs text-slate-500 mt-2">Reports today</p>
              </div>

               {/* Electricity Stats */}
               <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-slate-400 font-medium text-sm">Power Issues</h3>
                  <div className="p-2 bg-yellow-500/10 rounded-lg"><Zap className="w-5 h-5 text-yellow-400" /></div>
                </div>
                <div className="text-3xl font-bold text-slate-200">{stats.byType?.electricity || 0}</div>
                <p className="text-xs text-slate-500 mt-2">Reports today</p>
              </div>

              {/* Waste Stats */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-slate-400 font-medium text-sm">Garbage</h3>
                  <div className="p-2 bg-green-500/10 rounded-lg"><Trash2 className="w-5 h-5 text-green-400" /></div>
                </div>
                <div className="text-3xl font-bold text-slate-200">{stats.byType?.waste || 0}</div>
                <p className="text-xs text-slate-500 mt-2">Reports today</p>
              </div>
            </div>

            {/* Charts & Map mock */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl h-80">
                <h3 className="text-slate-300 font-semibold mb-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  Reports by Area
                </h3>
                {areaData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={areaData} margin={{ top: 0, right: 0, left: -20, bottom: 20 }}>
                      <XAxis dataKey="name" stroke="#64748b" tick={{fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tick={{fill: '#94a3b8'}} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip 
                        cursor={{fill: '#334155', opacity: 0.4}}
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {areaData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500">No data for today</div>
                )}
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl overflow-hidden flex flex-col">
                <h3 className="text-slate-300 font-semibold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  Insights & Nudges
                </h3>
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {insights.map((insight, idx) => (
                    <div key={idx} className="flex gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                      <div className="mt-0.5">{getInsightIcon(insight.type)}</div>
                      <p className="text-slate-300 text-sm leading-relaxed">{insight.text}</p>
                    </div>
                  ))}
                  {insights.length === 0 && (
                    <div className="text-slate-500 text-sm text-center mt-10">Gathering insights...</div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Right Column: Live Feed */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-slate-300 font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                  Live Activity Feed
                </h3>
                <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-1 rounded-md">{logs.length} Total</span>
             </div>
             
             <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
               {logs.map((log) => (
                 <div key={log.id || log._id} className="relative pl-6 pb-4 border-l border-slate-700 last:border-0 last:pb-0">
                   <div className="absolute -left-3 top-0 bg-slate-900 p-1 rounded-full border border-slate-700">
                     {getIconForType(log.resource_type)}
                   </div>
                   <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30 ml-2">
                     <div className="flex justify-between items-start mb-1">
                       <span className="font-medium text-slate-300 text-sm capitalize">{log.resource_type} Report</span>
                       <span className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                     </div>
                     <div className="text-xs text-slate-400 flex items-center gap-3">
                       <span>{log.area}</span>
                       <span className="flex items-center gap-1"><PhoneCall className="w-3 h-3"/> {log.phone_number.replace(/\d{4}$/, '****')}</span>
                     </div>
                   </div>
                 </div>
               ))}
               {logs.length === 0 && (
                 <div className="text-slate-500 text-sm text-center mt-10">No reports received yet.</div>
               )}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
