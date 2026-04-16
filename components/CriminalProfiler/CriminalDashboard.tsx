
import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { PersonProfile } from '../../types/criminalTypes';
import { Users, ShieldAlert, FileText, TrendingUp } from 'lucide-react';

interface DashboardProps {
  profiles: PersonProfile[];
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const CriminalDashboard: React.FC<DashboardProps> = ({ profiles }) => {
  const stats = useMemo(() => {
    const withCrimes = profiles.filter(p => p.totalCrimes > 0).length;
    const withoutCrimes = profiles.filter(p => p.totalCrimes === 0 && !p.isPep).length;
    const totalCrimes = profiles.reduce((acc, p) => acc + p.totalCrimes, 0);

    const crimeTypes: Record<string, number> = {};
    const riskLevels: Record<string, number> = {};

    profiles.forEach(p => {
      p.crimes.forEach(c => {
        crimeTypes[c.tipo] = (crimeTypes[c.tipo] || 0) + 1;
        riskLevels[c.riesgo] = (riskLevels[c.riesgo] || 0) + 1;
      });
    });

    const crimeTypeData = Object.entries(crimeTypes)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const riskData = Object.entries(riskLevels)
      .map(([name, value]) => ({ name, value }));

    return {
      withCrimes,
      withoutCrimes,
      totalCrimes,
      crimeTypeData,
      riskData
    };
  }, [profiles]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="Total RUTs"
          value={profiles.length}
          icon={<Users className="text-blue-500" />}
          subtitle="Registros procesados"
        />
        <StatCard
          title="Con Antecedentes"
          value={stats.withCrimes}
          icon={<ShieldAlert className="text-orange-500" />}
          subtitle={`${profiles.length ? ((stats.withCrimes / profiles.length) * 100).toFixed(1) : 0}% del total`}
        />
        <StatCard
          title="Sin Antecedentes"
          value={stats.withoutCrimes}
          icon={<TrendingUp className="text-emerald-500" />}
          subtitle={`${profiles.length ? ((stats.withoutCrimes / profiles.length) * 100).toFixed(1) : 0}% del total`}
          highlight="emerald"
        />
        <StatCard
          title="Total Delitos"
          value={stats.totalCrimes}
          icon={<FileText className="text-red-500" />}
          subtitle="Registros únicos"
        />
        <StatCard
          title="Promedio Delitos"
          value={(stats.totalCrimes / stats.withCrimes || 0).toFixed(1)}
          icon={<TrendingUp className="text-green-500" />}
          subtitle="Por RUT con historial"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 dark:text-white">Top 5 Tipos de Delitos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.crimeTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--tw-border-opacity, #e2e8f0)" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={100} fontSize={11} tick={{ fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 dark:text-white">Distribución de Riesgos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.riskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; subtitle: string; highlight?: 'emerald' }> = ({ title, value, icon, subtitle, highlight }) => (
  <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm flex items-start space-x-4 ${
    highlight === 'emerald'
      ? 'border-2 border-emerald-300 dark:border-emerald-700'
      : 'border border-slate-200 dark:border-slate-700'
  }`}>
    <div className={`p-3 rounded-lg ${highlight === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-slate-50 dark:bg-slate-800'}`}>{icon}</div>
    <div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <h4 className={`text-2xl font-bold ${highlight === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>{value}</h4>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>
    </div>
  </div>
);
