import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  ComposedChart, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, Users, Megaphone, TrendingUp, Calendar, 
  ArrowUpRight, ArrowDownRight, DollarSign, Activity, Filter, 
  Download, RefreshCw, Loader2, AlertCircle, CheckCircle, ShieldCheck
} from 'lucide-react';

// ==========================================
// 設定項目（セキュリティ・プライバシー対応版）
// ==========================================
const GOOGLE_API_KEY = 'AIzaSyB8AmSWn8VkjUtcNCA8ICc3NBvccX62Eb0';

// 各データの取得設定
// 個人情報を避けるため、batchGetを使用して不連続な列（A列とM列など）のみを取得します
const SHEET_CONFIG = {
  // ■ 入会管理表 (Raw Data)
  // 例: A列=日時, F列=学年, J列=カード有無, M列=校舎名
  ENROLLMENT: {
    id: '1TS77XUaFio3nUEB3sTEV2Kdj3KHFQ4NQKxRofjPS1mo',
    // 取得したい列だけを個別に指定（これ以外の列はAPIから返ってきません）
    ranges: ['Sheet1!A:A', 'Sheet1!F:F', 'Sheet1!M:M'], 
    // 取得したデータ配列のインデックス対応
    colIndex: { date: 0, grade: 1, campus: 2 } 
  },
  
  // ■ 退会管理表 (Raw Data) - 仮定
  WITHDRAWAL: {
    id: 'YOUR_WITHDRAWAL_SHEET_ID',
    ranges: ['Sheet1!A:A'], // 日付のみ取得
    colIndex: { date: 0 }
  },

  // ■ その他生徒変動 (転出入など) - 仮定
  OTHERS: {
    id: 'YOUR_OTHER_SHEET_ID',
    ranges: ['Sheet1!A:A', 'Sheet1!B:B'], // A=日付, B=種別(転入/転出/編入)
    colIndex: { date: 0, type: 1 }
  },

  // ■ メイン計画表 (予算・集客計画など) - これは月別集計済みデータを想定
  MAIN: {
    id: 'YOUR_MAIN_SHEET_ID',
    range: 'Sheet1!A2:F14' // A=月, B=予算売上, C=実績売上, D=チラシ数...
  }
};

/**
 * データ型定義
 */
type DashboardData = {
  name: string;
  monthIndex: number; // 4月=0, ... 3月=11
  // 財務
  budgetRevenue: number;
  actualRevenue: number;
  expenses: number;
  // 生徒数フロー
  newEnrollments: number;
  withdrawals: number;
  recess: number;
  transferOut: number;
  transferIn: number;
  readmission: number;
  graduates: number;
  totalStudents: number;
  // 集客
  flyers: number;
  touchAndTry: number;
  trialLessons: number;
  enrollmentRate: string;
};

// ==========================================
// ヘルパー関数: 日付文字列から年度内の月インデックスを計算
// ==========================================
const getFiscalMonthIndex = (dateStr: string): number => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return -1; // 無効な日付
  
  const month = date.getMonth(); // 0-11 (0=1月, 3=4月)
  // 4月始まりの年度インデックスに変換 (4月->0, 3月->11)
  return (month + 9) % 12;
};

/**
 * モックデータ生成: 明細データ（ローデータ）のシミュレーション
 */
const generateMockRawData = () => {
  const mockRows: { date: string, type?: string }[] = [];
  
  // 過去1年分のランダムな日付を生成
  const start = new Date('2024-04-01');
  const end = new Date('2025-03-31');
  
  // 入会データのモック (約150件)
  const enrollments = Array.from({ length: 150 }, () => {
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return { date: date.toISOString(), campus: Math.random() > 0.5 ? '大阪校' : '東京校' };
  });

  // 退会データのモック (約20件)
  const withdrawals = Array.from({ length: 20 }, () => {
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return { date: date.toISOString() };
  });

  // その他（転出入など）
  const others = Array.from({ length: 30 }, () => {
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    const types = ['transferIn', 'transferOut', 'readmission'];
    return { 
      date: date.toISOString(), 
      type: types[Math.floor(Math.random() * types.length)] 
    };
  });

  return { enrollments, withdrawals, others };
};

// 週次・日次データのダミー生成機能
const generateDailyData = (monthData: any) => {
  if (!monthData) return [];
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return days.map(day => ({
    name: `${day}日`,
    actualRevenue: Math.floor(monthData.actualRevenue / 30 * (0.5 + Math.random())),
    trialLessons: Math.random() > 0.7 ? Math.floor(Math.random() * 3) : 0,
    newEnrollments: Math.random() > 0.8 ? 1 : 0,
    flyers: Math.random() > 0.5 ? 50 : 0,
  }));
};

// UIコンポーネント: カード
const StatCard = ({ title, value, subValue, trend, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    <div className="mt-4 flex items-center text-sm">
      <span className={`flex items-center font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {trend >= 0 ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
        {Math.abs(trend)}%
      </span>
      <span className="text-slate-400 ml-2">{subValue}</span>
    </div>
  </div>
);

// メインアプリケーション
export default function RobotSchoolDashboard() {
  const [activeTab, setActiveTab] = useState('summary');
  const [timeframe, setTimeframe] = useState('annual');
  const [selectedMonth, setSelectedMonth] = useState('4月');
  
  const [data, setData] = useState<DashboardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // データ取得＆集計関数
  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // ---------------------------------------------------------
      // TODO: 本番環境での batchGet 実装イメージ
      // ---------------------------------------------------------
      /*
      // 入会シートから特定の列（日時、学年、校舎）のみを取得
      // rangesパラメータに複数の範囲を指定することで、間の個人情報列（名前など）をスキップします
      const enrollmentUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_CONFIG.ENROLLMENT.id}/values:batchGet?ranges=${SHEET_CONFIG.ENROLLMENT.ranges.join('&ranges=')}&key=${GOOGLE_API_KEY}`;
      
      const [enrollRes, withdrawRes, mainRes] = await Promise.all([
        fetch(enrollmentUrl).then(r => r.json()),
        fetch(...).then(r => r.json()),
        // ...
      ]);
      
      // レスポンスの処理: valueRanges配列に指定順で列データが入っています
      const enrollmentRows = parseBatchResponse(enrollRes, SHEET_CONFIG.ENROLLMENT.colIndex);
      */

      // ▼ シミュレーション: ローデータ生成と集計処理 ▼
      await new Promise(resolve => setTimeout(resolve, 1500)); 
      
      const rawData = generateMockRawData();
      const months = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];

      // 集計用バケットの初期化
      const aggregatedData = months.map((month, idx) => {
        // 季節性のシミュレーション（予算など）
        const seasonality = [0.8, 0.9, 1.0, 1.2, 1.3, 1.0, 1.0, 0.9, 1.1, 0.8, 0.9, 1.5][idx];
        const budgetRevenue = Math.floor(2000000 * seasonality);
        const flyers = Math.floor(1000 * seasonality);
        
        return {
          name: month,
          monthIndex: idx,
          budgetRevenue,
          actualRevenue: Math.floor(budgetRevenue * (0.9 + Math.random() * 0.2)),
          expenses: Math.floor(budgetRevenue * 0.6),
          flyers,
          touchAndTry: Math.floor(flyers * 0.05),
          trialLessons: Math.floor(flyers * 0.02 + Math.random() * 5),
          // 実績値は以下でローデータから集計
          newEnrollments: 0,
          withdrawals: 0,
          recess: 0,
          transferOut: 0,
          transferIn: 0,
          readmission: 0,
          graduates: idx === 11 ? 5 : 0, // 3月のみ初期値
          totalStudents: 0,
          enrollmentRate: "0",
        };
      });

      // 1. 入会データの集計 (Raw Data -> Monthly Count)
      rawData.enrollments.forEach(row => {
        const mIdx = getFiscalMonthIndex(row.date);
        if (mIdx >= 0 && mIdx < 12) {
          aggregatedData[mIdx].newEnrollments += 1;
        }
      });

      // 2. 退会データの集計
      rawData.withdrawals.forEach(row => {
        const mIdx = getFiscalMonthIndex(row.date);
        if (mIdx >= 0 && mIdx < 12) {
          aggregatedData[mIdx].withdrawals += 1;
        }
      });

      // 3. その他（転入出）の集計
      rawData.others.forEach(row => {
        const mIdx = getFiscalMonthIndex(row.date);
        if (mIdx >= 0 && mIdx < 12) {
          if (row.type === 'transferIn') aggregatedData[mIdx].transferIn += 1;
          if (row.type === 'transferOut') aggregatedData[mIdx].transferOut += 1;
          if (row.type === 'readmission') aggregatedData[mIdx].readmission += 1;
        }
      });

      // 4. 在籍数の累積計算 (Running Total)
      let currentStudents = 100; // 期首生徒数
      const finalData = aggregatedData.map(d => {
        const netChange = d.newEnrollments + d.transferIn + d.readmission - d.withdrawals - d.transferOut - d.graduates;
        currentStudents += netChange;
        
        return {
          ...d,
          totalStudents: currentStudents,
          enrollmentRate: ((d.newEnrollments / (d.trialLessons || 1)) * 100).toFixed(1)
        };
      });

      setData(finalData);
      setLastUpdated(new Date());

    } catch (err) {
      console.error("Failed to fetch data", err);
      setError("データの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 計算ロジック（合計など）
  const totals = useMemo(() => {
    return data.reduce((acc, curr) => ({
      budgetRevenue: acc.budgetRevenue + curr.budgetRevenue,
      actualRevenue: acc.actualRevenue + curr.actualRevenue,
      newEnrollments: acc.newEnrollments + curr.newEnrollments,
      withdrawals: acc.withdrawals + curr.withdrawals,
      flyers: acc.flyers + curr.flyers,
      trialLessons: acc.trialLessons + curr.trialLessons,
    }), {
      budgetRevenue: 0, actualRevenue: 0, newEnrollments: 0, withdrawals: 0, flyers: 0, trialLessons: 0
    });
  }, [data]);

  const revenueAchievement = totals.budgetRevenue > 0 ? Math.round((totals.actualRevenue / totals.budgetRevenue) * 100) : 0;
  const selectedMonthData = data.find(d => d.name === selectedMonth) || data[0];
  const dailyData = useMemo(() => generateDailyData(selectedMonthData), [selectedMonthData]);

  // フォーマッター
  const formatYen = (val: number) => `¥${val.toLocaleString()}`;

  // ローディング画面
  if (isLoading && data.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-600" />
        <p>セキュリティポリシーに従いデータを取得中...</p>
        <div className="flex items-center text-xs text-slate-400 mt-2 bg-slate-100 px-3 py-1 rounded-full">
          <ShieldCheck className="w-3 h-3 mr-1" />
          個人情報列を除外して集計しています
        </div>
      </div>
    );
  }

  // 財務・経営サマリー画面
  const renderSummary = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="年間売上実績" 
          value={formatYen(totals.actualRevenue)} 
          subValue={`予算比 ${revenueAchievement}%`}
          trend={revenueAchievement - 100}
          icon={DollarSign}
          color="bg-blue-500"
        />
        <StatCard 
          title="現在の生徒数" 
          value={`${data.length > 0 ? data[data.length - 1].totalStudents : 0}名`} 
          subValue={`期首比 ${data.length > 0 ? data[data.length - 1].totalStudents - 100 : 0}名増`}
          trend={3.2}
          icon={Users}
          color="bg-indigo-500"
        />
        <StatCard 
          title="体験会実施数 (累計)" 
          value={`${totals.trialLessons}回`} 
          subValue="目標達成率 92%"
          trend={-8}
          icon={Calendar}
          color="bg-amber-500"
        />
        <StatCard 
          title="平均入会率" 
          value="68.4%" 
          subValue="目標 60%"
          trend={8.4}
          icon={Activity}
          color="bg-emerald-500"
        />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">予実管理推移 (売上)</h3>
              <p className="text-sm text-slate-500">予算 vs 実績の月次比較</p>
            </div>
            <select 
              className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-2"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              <option value="annual">年間表示</option>
              <option value="monthly">月次詳細</option>
            </select>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" tickFormatter={(val) => `${val/10000}万`} />
                <Tooltip formatter={(value: number) => formatYen(value)} />
                <Legend />
                <Bar yAxisId="left" dataKey="budgetRevenue" name="予算" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="actualRevenue" name="実績" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-2">経費内訳 (概算)</h3>
          <p className="text-sm text-slate-500 mb-6">直近月のコスト構造</p>
          <div className="h-64 flex justify-center items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: '人件費', value: 400 },
                    { name: '教材費', value: 300 },
                    { name: '広告費', value: 200 },
                    { name: '家賃・光熱', value: 100 },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#6366f1" />
                  <Cell fill="#8b5cf6" />
                  <Cell fill="#ec4899" />
                  <Cell fill="#cbd5e1" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-indigo-500 mr-2"></div>人件費</span>
              <span className="font-semibold">40%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-violet-500 mr-2"></div>教材費（ロボット代）</span>
              <span className="font-semibold">30%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-pink-500 mr-2"></div>広告宣伝費</span>
              <span className="font-semibold">20%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 日次・週次ドリルダウン（デモ） */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-800">日次実績モニター</h3>
          <select 
            className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-2"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {data.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" interval={6} />
              <YAxis />
              <Tooltip formatter={(val: number) => formatYen(val)} />
              <Area type="monotone" dataKey="actualRevenue" stroke="#0ea5e9" fill="#e0f2fe" name="日次売上" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  // 生徒管理画面
  const renderStudents = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">生徒数増減フロー</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="newEnrollments" name="入会" fill="#10b981" stackId="stack" />
                <Bar dataKey="transferIn" name="転入" fill="#34d399" stackId="stack" />
                <Bar dataKey="readmission" name="編入" fill="#6ee7b7" stackId="stack" />
                <Bar dataKey="withdrawals" name="退会" fill="#ef4444" stackId="stack" />
                <Bar dataKey="transferOut" name="転出" fill="#f87171" stackId="stack" />
                <Bar dataKey="graduates" name="卒業" fill="#f59e0b" stackId="stack" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">在籍生徒数推移</h3>
          <div className="h-80">
             <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip />
                <Area type="monotone" dataKey="totalStudents" name="在籍数" stroke="#6366f1" fill="#e0e7ff" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">月別生徒変動詳細</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">月度</th>
                <th className="px-6 py-4 text-emerald-600">入会</th>
                <th className="px-6 py-4 text-emerald-600">転入</th>
                <th className="px-6 py-4 text-emerald-600">編入</th>
                <th className="px-6 py-4 text-rose-600">退会</th>
                <th className="px-6 py-4 text-rose-600">転出</th>
                <th className="px-6 py-4 text-amber-600">休会</th>
                <th className="px-6 py-4 text-orange-600">卒業</th>
                <th className="px-6 py-4 font-bold">月末在籍</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{row.name}</td>
                  <td className="px-6 py-4 bg-emerald-50/50">{row.newEnrollments}</td>
                  <td className="px-6 py-4 bg-emerald-50/50">{row.transferIn}</td>
                  <td className="px-6 py-4 bg-emerald-50/50">{row.readmission}</td>
                  <td className="px-6 py-4 bg-rose-50/50">{row.withdrawals}</td>
                  <td className="px-6 py-4 bg-rose-50/50">{row.transferOut}</td>
                  <td className="px-6 py-4 bg-amber-50/50">{row.recess}</td>
                  <td className="px-6 py-4 bg-orange-50/50">{row.graduates}</td>
                  <td className="px-6 py-4 font-bold">{row.totalStudents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // マーケティング画面
  const renderMarketing = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">集客活動ファネル</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" orientation="left" stroke="#64748b" />
                <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="flyers" name="門配・チラシ配布数" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="trialLessons" name="体験会参加" stroke="#f59e0b" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="newEnrollments" name="入会数" stroke="#10b981" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">入会率ヒートマップ</h3>
          <div className="space-y-4 overflow-y-auto max-h-80 pr-2">
            {data.map((d, i) => (
              <div key={i} className="flex items-center justify-between group">
                <span className="text-sm font-medium text-slate-600 w-12">{d.name}</span>
                <div className="flex-1 mx-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${Number(d.enrollmentRate) > 70 ? 'bg-emerald-500' : Number(d.enrollmentRate) > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${d.enrollmentRate}%` }}
                  ></div>
                </div>
                <span className="text-sm font-bold w-12 text-right">{d.enrollmentRate}%</span>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-slate-50 rounded-lg text-sm text-slate-600">
            <div className="flex items-start mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mr-2 mt-0.5" />
              <p>4月と8月の体験会からの入会率が高い傾向にあります。</p>
            </div>
            <div className="flex items-start">
              <AlertCircle className="w-4 h-4 text-amber-500 mr-2 mt-0.5" />
              <p>12月は「タッチ&トライ」実施数に対して本入会への転換が低下気味です。</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-2">タッチ＆トライ実施状況</h3>
          <p className="text-sm text-slate-500 mb-4">プチ体験イベントの効果測定</p>
          <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={40} />
                <Tooltip />
                <Bar dataKey="touchAndTry" name="実施数" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center">
            <div className="p-4 bg-blue-50 rounded-full mb-4">
              <Megaphone className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">アクションプラン</h3>
            <p className="text-slate-500 mb-6 max-w-xs">
              現在のコンバージョン率に基づき、来月の門配（チラシ配布）目標数を自動算出します。
            </p>
            <div className="w-full max-w-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">目標入会数</span>
                <span className="text-lg font-bold text-emerald-600">5名</span>
              </div>
              <div className="h-px bg-slate-200 my-2"></div>
              <div className="flex justify-between items-center text-sm text-slate-600 mb-1">
                <span>必要体験者数</span>
                <span>8名 (CV 62.5%)</span>
              </div>
              <div className="flex justify-between items-center text-sm text-slate-600">
                <span>推奨門配数</span>
                <span>1,200枚</span>
              </div>
            </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">RobotSchool<span className="text-blue-400">Dash</span></span>
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          <button 
            onClick={() => setActiveTab('summary')}
            className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'summary' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">経営サマリー</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('students')}
            className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'students' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Users className="w-5 h-5" />
            <span className="font-medium">生徒管理</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('marketing')}
            className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${activeTab === 'marketing' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Megaphone className="w-5 h-5" />
            <span className="font-medium">集客・マーケティング</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">データソース</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                Secure Connection
              </span>
            </div>
            {lastUpdated && (
              <p className="text-[10px] text-slate-400 mt-1">
                最終同期: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
            <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-700 pt-1 flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1 text-emerald-500" />
              個人情報保護モード
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-slate-800">
              {activeTab === 'summary' && 'ダッシュボード概要'}
              {activeTab === 'students' && '生徒数・入退会管理'}
              {activeTab === 'marketing' && '集客活動・販促管理'}
            </h1>
            <span className="text-slate-300 text-sm">|</span>
            <div className="flex items-center text-slate-500 text-sm">
              <Calendar className="w-4 h-4 mr-2" />
              <span>2024年度</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button 
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>データ更新</span>
            </button>
            <button className="flex items-center space-x-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-all">
              <Filter className="w-4 h-4" />
              <span>条件絞り込み</span>
            </button>
            <button className="flex items-center space-x-2 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all">
              <Download className="w-4 h-4" />
              <span>レポート出力</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {error ? (
              <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 mb-6 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {error}
              </div>
            ) : (
              <>
                {activeTab === 'summary' && renderSummary()}
                {activeTab === 'students' && renderStudents()}
                {activeTab === 'marketing' && renderMarketing()}
              </>
            )}
          </div>
          <footer className="mt-12 text-center text-slate-400 text-sm py-6">
            © 2024 Robot School Management System. All rights reserved.
          </footer>
        </div>
      </main>
    </div>
  );
}
