
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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export const CriminalDashboard: React.FC<DashboardProps> = ({ profiles }) => {
  const stats = useMemo(() => {
    const withCrimes = profiles.filter(p => p.totalCrimes > 0).length;
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
      totalCrimes,
      crimeTypeData,
      riskData
    };
  }, [profiles]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          subtitle={`${((stats.withCrimes/profiles.length)*100).toFixed(1)}% del total`}
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold mb-6 text-slate-800">Top 5 Tipos de Delitos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.crimeTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} fontSize={12} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold mb-6 text-slate-800">Distribución de Riesgos</h3>
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
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; subtitle: string }> = ({ title, value, icon, subtitle }) => (
  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-start space-x-4">
    <div className="p-3 bg-slate-50 rounded-lg">{icon}</div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h4 className="text-2xl font-bold text-slate-900">{value}</h4>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  </div>
);
