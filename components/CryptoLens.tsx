
import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { CryptoNetwork, CryptoWalletProfile, CryptoTransaction, CryptoTokenBalance, PatternAnalysisResult } from '../types';
import { detectNetwork, fetchWalletData } from '../services/cryptoService';
import { analyzeCryptoWalletWithGemini, analyzeCryptoPatterns, hasValidApiKeys } from '../services/geminiService';
import { getTextFromFile } from '../services/fileProcessorService';
import { generateCryptoPdf } from '../services/pdfGenerator';
import { trackEvent } from '../services/analyticsService';
import { TransactionNetworkGraph } from './TransactionNetworkGraph';
import {
    IconSearch, IconShieldCheck, IconAlertTriangleSolid, IconWallet,
    IconCheckCircle, IconCamera, IconChevronLeft, IconChevronRight,
    IconPrinter, IconTrendingUp, IconTrendingDown, IconDollarSign, IconActivity,
    IconExternalLink, IconPieChart, IconUsers, IconHash, IconPdf
} from './IconComponents';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert } from './Alert';
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

// ─── MasivoItem ────────────────────────────────────────────────────────────────
interface MasivoItem {
  id: string;
  wallet: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  detectedNetwork?: CryptoNetwork;
  result?: CryptoWalletProfile;
  error?: string;
}

const COLORS = ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF'];
const RISK_COLORS: { [key:string]: string } = {
    'Bajo': 'text-green-600',
    'Medio': 'text-yellow-600',
    'Alto': 'text-orange-600',
    'Crítico': 'text-red-600',
};

const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (isoString: string) => new Date(isoString).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' });

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; trend?: 'up' | 'down' | 'neutral' }> = ({ title, value, icon }) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
        <div>
            <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-500">{title}</p>
                <div className="text-slate-400">{icon}</div>
            </div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
    </div>
);

const AssetDonutChart: React.FC<{ tokens: CryptoTokenBalance[], totalValue: number }> = ({ tokens, totalValue }) => {
    const chartData = useMemo(() => {
        if (!tokens || totalValue === 0) return [];
        return tokens
            .filter(t => t.usdValue && t.usdValue > 0)
            .map(t => ({ name: t.tokenSymbol, value: t.usdValue }))
            .sort((a, b) => b.value - a.value);
    }, [tokens, totalValue]);

    if (chartData.length === 0) return <div className="text-center py-10 text-slate-500">No hay datos de activos para mostrar.</div>;

    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 h-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><IconPieChart className="w-5 h-5 mr-2 text-primary-500"/>Distribución de Activos</h3>
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" labelLine={false}>
                        {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Valor']} />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

const VolumeHistoryChart: React.FC<{ transactions: CryptoTransaction[], address: string }> = ({ transactions, address }) => {
    const chartData = useMemo(() => {
        const monthlyData: { [key: string]: { received: number, sent: number } } = {};
        const lowerCaseAddress = address.toLowerCase();

        transactions.forEach(tx => {
            const month = new Date(tx.timeStamp).toISOString().slice(0, 7);
            if (!monthlyData[month]) monthlyData[month] = { received: 0, sent: 0 };

            const value = (tx as any).valueUSD || tx.value;

            if (tx.to.toLowerCase() === lowerCaseAddress) {
                monthlyData[month].received += value;
            }
            if (tx.from.toLowerCase() === lowerCaseAddress) {
                monthlyData[month].sent += value;
            }
        });
        return Object.entries(monthlyData).map(([name, value]) => ({ name, ...value })).sort((a,b) => a.name.localeCompare(b.name));
    }, [transactions, address]);

    if (chartData.length === 0) return <div className="text-center py-10 text-slate-500">No hay historial de volumen.</div>;

    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
             <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><IconActivity className="w-5 h-5 mr-2 text-primary-500"/>Volumen Transaccional (USD)</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tickFormatter={(value) => `$${Number(value).toLocaleString()}`} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }} formatter={(value: number) => [formatCurrency(value), 'Volumen']} />
                    <Legend />
                    <Bar dataKey="received" stackId="a" fill="#4F46E5" name="Recibido" />
                    <Bar dataKey="sent" stackId="a" fill="#A5B4FC" name="Enviado" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

const TransactionsTable: React.FC<{ transactions: CryptoTransaction[] }> = ({ transactions }) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Transacciones Recientes</h3>
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                    <tr>
                        <th scope="col" className="px-6 py-3">Fecha</th>
                        <th scope="col" className="px-6 py-3">Tipo</th>
                        <th scope="col" className="px-6 py-3">Monto</th>
                        <th scope="col" className="px-6 py-3">Desde/Hacia</th>
                        <th scope="col" className="px-6 py-3">Hash</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.slice(0, 10).map((tx, i) => (
                        <tr key={i} className="bg-white border-b hover:bg-slate-50">
                            <td className="px-6 py-4 whitespace-nowrap">{formatDate(tx.timeStamp)}</td>
                            <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full ${Math.random() > 0.5 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{Math.random() > 0.5 ? 'Entrada' : 'Salida'}</span></td>
                            <td className="px-6 py-4 font-medium">{tx.value.toFixed(4)} {tx.tokenSymbol}</td>
                            <td className="px-6 py-4 font-mono text-xs">{Math.random() > 0.5 ? tx.from.slice(0, 10) : tx.to.slice(0, 10)}...</td>
                            <td className="px-6 py-4"><a href="#" className="text-primary-600 hover:underline"><IconExternalLink className="w-4 h-4"/></a></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

interface WalletReportCardProps {
    data: CryptoWalletProfile;
    onPrint: () => void;
    patternResult: PatternAnalysisResult | null;
    isAnalyzingPatterns: boolean;
    onAnalyzePatterns: () => void;
}

const WalletReportCard: React.FC<WalletReportCardProps> = ({ data, onPrint, patternResult, isAnalyzingPatterns, onAnalyzePatterns }) => (
    <div className="space-y-8 animate-fade-in">
        <div className="flex justify-between items-start">
            <div>
                <h2 className="text-3xl font-bold text-slate-900">Reporte Forense</h2>
                <p className="text-slate-500 font-mono text-sm mt-1">{data.address}</p>
            </div>
            <button onClick={onPrint} className="flex items-center bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                <IconPdf className="w-4 h-4 mr-2"/> Exportar a PDF
            </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Patrimonio Neto (USD)" value={formatCurrency(data.netWorthUSD)} icon={<IconWallet className="w-5 h-5" />} />
            <StatCard title="Total Recibido (USD)" value={formatCurrency(data.totalReceivedUSD)} icon={<IconTrendingDown className="w-5 h-5 text-green-500" />} />
            <StatCard title="Total Enviado (USD)" value={formatCurrency(data.totalSentUSD)} icon={<IconTrendingUp className="w-5 h-5 text-red-500" />} />
            <StatCard title="Transacciones Totales" value={data.totalTxCount} icon={<IconActivity className="w-5 h-5" />} />
        </div>

        {/* AI Analysis Section */}
        {data.riskAssessment && (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                 <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center"><IconShieldCheck className="w-5 h-5 mr-2 text-primary-500"/>Análisis de Riesgo IA (Gemini)</h3>
                 <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-300">
                    <p>{data.riskAssessment.summaryAnalysis}</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        {data.riskAssessment.riskFactors.map((factor, i) => <li key={i}>{factor}</li>)}
                    </ul>
                 </div>
                 <div className="mt-4">
                    <button
                        onClick={onAnalyzePatterns}
                        disabled={isAnalyzingPatterns}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                        {isAnalyzingPatterns ? (
                            <>
                                <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                Detectando patrones...
                            </>
                        ) : '🔍 Detectar Patrones AML'}
                    </button>
                 </div>
            </div>
        )}

        {/* Pattern Analysis Results */}
        {patternResult && (
            <div className="mt-6 p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                    🔍 Análisis de Patrones AML
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        patternResult.nivelRiesgoGeneral === 'Crítico' ? 'bg-red-100 text-red-800' :
                        patternResult.nivelRiesgoGeneral === 'Alto' ? 'bg-orange-100 text-orange-800' :
                        patternResult.nivelRiesgoGeneral === 'Medio' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                    }`}>{patternResult.nivelRiesgoGeneral}</span>
                </h3>

                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{patternResult.resumenPatrones}</p>

                <div className="space-y-3 mb-4">
                    {patternResult.alertas.filter(a => a.detectado).map((alerta, idx) => (
                        <div key={idx} className={`p-3 rounded-lg border-l-4 ${
                            alerta.severidad === 'Alta' ? 'bg-red-50 border-red-500 dark:bg-red-900/20' :
                            alerta.severidad === 'Media' ? 'bg-orange-50 border-orange-500 dark:bg-orange-900/20' :
                            'bg-yellow-50 border-yellow-500 dark:bg-yellow-900/20'
                        }`}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">⚠️ {alerta.tipo}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    alerta.severidad === 'Alta' ? 'bg-red-200 text-red-800' :
                                    alerta.severidad === 'Media' ? 'bg-orange-200 text-orange-800' : 'bg-yellow-200 text-yellow-800'
                                }`}>{alerta.severidad}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">{alerta.descripcion}</p>
                        </div>
                    ))}
                    {patternResult.alertas.every(a => !a.detectado) && (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                            <p className="text-sm text-green-800 dark:text-green-300">✅ No se detectaron patrones sospechosos en las transacciones analizadas.</p>
                        </div>
                    )}
                </div>

                {patternResult.recomendacionesUAF.length > 0 && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase mb-2">Recomendaciones UAF/UIAF</p>
                        <ul className="space-y-1">
                            {patternResult.recomendacionesUAF.map((rec, i) => (
                                <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex gap-2"><span>•</span>{rec}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        )}

        {/* Transaction Network Graph */}
        {data.transactions && data.transactions.length > 0 && (
            <TransactionNetworkGraph
                walletAddress={data.address}
                transactions={data.transactions}
            />
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2">
                 <AssetDonutChart tokens={data.tokens} totalValue={data.netWorthUSD} />
            </div>
            <div className="lg:col-span-3">
                <VolumeHistoryChart transactions={data.transactions} address={data.address} />
            </div>
        </div>

        {/* Transactions Table */}
        <div>
            <TransactionsTable transactions={data.transactions} />
        </div>
    </div>
);

// Keep the old AnalysisDashboard name as an alias so nothing else breaks
interface AnalysisDashboardProps {
    data: CryptoWalletProfile;
    onPrint: () => void;
    patternResult: PatternAnalysisResult | null;
    isAnalyzingPatterns: boolean;
    onAnalyzePatterns: () => void;
}

const AnalysisDashboard: React.FC<AnalysisDashboardProps> = (props) => <WalletReportCard {...props} />;

// ─── Masivo status chip ─────────────────────────────────────────────────────────
const StatusChip: React.FC<{ status: MasivoItem['status'] }> = ({ status }) => {
    const map: Record<MasivoItem['status'], { label: string; className: string }> = {
        pending:    { label: 'Pendiente',    className: 'bg-slate-100 text-slate-600' },
        processing: { label: 'Procesando',   className: 'bg-blue-100 text-blue-700' },
        done:       { label: 'Completado',   className: 'bg-green-100 text-green-700' },
        error:      { label: 'Error',        className: 'bg-red-100 text-red-700' },
    };
    const { label, className } = map[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>
            {status === 'processing' && (
                <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
            )}
            {label}
        </span>
    );
};

// ─── Main CryptoLens component ──────────────────────────────────────────────────
export const CryptoLens: React.FC = () => {
    // ── Individual mode state ──────────────────────────────────────────────────
    const [address, setAddress] = useState('');
    const [network, setNetwork] = useState<CryptoNetwork | 'AUTO'>('AUTO');
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [walletData, setWalletData] = useState<CryptoWalletProfile | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [patternResult, setPatternResult] = useState<PatternAnalysisResult | null>(null);
    const [isAnalyzingPatterns, setIsAnalyzingPatterns] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Mode toggle ────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<'individual' | 'masivo'>('individual');

    // ── Masivo mode state ──────────────────────────────────────────────────────
    const [masivoItems, setMasivoItems] = useState<MasivoItem[]>([]);
    const [masivoRunning, setMasivoRunning] = useState(false);
    const [masivoIsPaused, setMasivoIsPaused] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [masivoError, setMasivoError] = useState<string | null>(null);
    const abortRef = useRef(false);
    const pausedRef = useRef(false);
    const masivoFileRef = useRef<HTMLInputElement>(null);

    // ── Individual: analyze patterns ───────────────────────────────────────────
    const handleAnalyzePatterns = async () => {
        if (!walletData || !walletData.transactions.length) return;
        setIsAnalyzingPatterns(true);
        setError(null);
        try {
            const result = await analyzeCryptoPatterns(walletData.transactions, walletData.address, walletData.network);
            setPatternResult(result);
        } catch (e: any) {
            setError(e.message || 'Error al analizar patrones AML.');
        } finally {
            setIsAnalyzingPatterns(false);
        }
    };

    // ── Individual: search ─────────────────────────────────────────────────────
    const handleSearch = async () => {
        if (!hasValidApiKeys()) {
            setError("Se requiere una API Key de Gemini válida para el análisis forense.");
            return;
        }
        if (!address.trim()) { setError("Por favor ingresa una dirección de billetera."); return; }

        setLoading(true);
        setError(null);
        setWalletData(null);
        setPatternResult(null);
        setHasSearched(true);

        try {
            setLoadingStep('Detectando red blockchain...');
            const detectedNet = network === 'AUTO' ? detectNetwork(address.trim()) : network;
            if (detectedNet === 'UNKNOWN') throw new Error("Red no soportada o dirección inválida. Verifique la dirección o seleccione la red manualmente.");

            setLoadingStep(`Obteniendo datos de ${detectedNet}...`);
            const rawProfile = await fetchWalletData(address.trim(), detectedNet);

            setLoadingStep('Generando perfil forense con IA...');
            const riskAssessment = await analyzeCryptoWalletWithGemini(rawProfile);

            setWalletData({ ...rawProfile, riskAssessment });
            trackEvent({ type: 'crypto_analyzed', module: 'crypto' });
        } catch (e: any) {
            setError(e.message || 'Ocurrió un error inesperado.');
        } finally {
            setLoading(false);
        }
    };

    // ── Individual: image upload / OCR ─────────────────────────────────────────
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true); setLoadingStep('Extrayendo texto de imagen (OCR)...'); setError(null);
        try {
            const text = await getTextFromFile(file);
            const ethRegex = /0x[a-fA-F0-9]{40}/;
            const tronRegex = /T[a-zA-Z0-9]{33}/;
            const btcRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/;

            const ethMatch = text.match(ethRegex);
            const tronMatch = text.match(tronRegex);
            const btcMatch = text.match(btcRegex);

            if (ethMatch) { setAddress(ethMatch[0]); setNetwork('ETH'); }
            else if (tronMatch) { setAddress(tronMatch[0]); setNetwork('TRON'); }
            else if (btcMatch) { setAddress(btcMatch[0]); setNetwork('BTC'); }
            else { throw new Error("No se pudo detectar una dirección de billetera en la imagen."); }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Masivo: read Excel file ────────────────────────────────────────────────
    const handleMasivoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (rows.length < 2) {
                    setMasivoError('El archivo no contiene datos suficientes.');
                    return;
                }

                const headers: string[] = (rows[0] as any[]).map((h: any) => String(h).toLowerCase().trim());
                const walletKeywords = ['wallet', 'address', 'hash', 'direccion', 'billetera', 'dirección'];
                let colIdx = headers.findIndex(h => walletKeywords.some(kw => h.includes(kw)));
                if (colIdx === -1) colIdx = 0; // fallback to first column

                const items: MasivoItem[] = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i] as any[];
                    const wallet = String(row[colIdx] || '').trim();
                    if (!wallet) continue;
                    items.push({
                        id: `${i}-${wallet.slice(0, 8)}`,
                        wallet,
                        status: 'pending'
                    });
                }

                if (items.length === 0) {
                    setMasivoError('No se encontraron direcciones válidas en el archivo.');
                    return;
                }

                setMasivoItems(items);
                setMasivoError(null);
            } catch (err: any) {
                setMasivoError(`Error leyendo archivo: ${err.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
        if (masivoFileRef.current) masivoFileRef.current.value = '';
    };

    // ── Masivo: process queue ──────────────────────────────────────────────────
    const procesarMasivo = async () => {
        if (!hasValidApiKeys()) {
            setMasivoError('Se requiere una API Key de Gemini válida.');
            return;
        }
        abortRef.current = false;
        pausedRef.current = false;
        setMasivoRunning(true);
        setMasivoIsPaused(false);
        setMasivoError(null);

        for (let i = 0; i < masivoItems.length; i++) {
            if (abortRef.current) break;
            while (pausedRef.current) await new Promise(r => setTimeout(r, 300));
            if (abortRef.current) break;

            const item = masivoItems[i];
            if (item.status !== 'pending') continue;

            setMasivoItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'processing' } : it));

            try {
                const detectedNet = detectNetwork(item.wallet);
                const net: CryptoNetwork = detectedNet === 'UNKNOWN' ? 'ETH' : detectedNet;
                const rawProfile = await fetchWalletData(item.wallet, net);
                const riskAssessment = await analyzeCryptoWalletWithGemini(rawProfile);
                const fullProfile = { ...rawProfile, riskAssessment };

                setMasivoItems(prev => prev.map(it => it.id === item.id ? {
                    ...it, status: 'done', result: fullProfile, detectedNetwork: net
                } : it));
            } catch (e: any) {
                setMasivoItems(prev => prev.map(it => it.id === item.id ? {
                    ...it, status: 'error', error: e.message
                } : it));
            }

            if (i < masivoItems.length - 1 && !abortRef.current) {
                await new Promise(r => setTimeout(r, 2500));
            }
        }

        setMasivoRunning(false);
    };

    const pauseMasivo = () => {
        pausedRef.current = true;
        setMasivoIsPaused(true);
    };

    const resumeMasivo = () => {
        pausedRef.current = false;
        setMasivoIsPaused(false);
    };

    const stopMasivo = () => {
        abortRef.current = true;
        pausedRef.current = false;
        setMasivoIsPaused(false);
        setMasivoRunning(false);
        // Reset any 'processing' items back to 'pending'
        setMasivoItems(prev => prev.map(it => it.status === 'processing' ? { ...it, status: 'pending' } : it));
    };

    // ── Masivo: export Excel summary ───────────────────────────────────────────
    const exportarMasivoExcel = () => {
        const doneItems = masivoItems.filter(it => it.status === 'done' && it.result);
        if (doneItems.length === 0) return;

        const rows = doneItems.map(it => {
            const r = it.result!;
            return {
                'Wallet': r.address,
                'Red': r.network,
                'Balance Nativo': r.nativeBalance,
                'Net Worth USD': r.netWorthUSD,
                'Total Txs': r.totalTxCount,
                'Riesgo': r.riskAssessment?.riskLevel || '',
                'Score': r.riskAssessment?.riskScore ?? '',
                'Recibido USD': r.totalReceivedUSD,
                'Enviado USD': r.totalSentUSD,
                'Primera Actividad': formatDate(r.firstActivity),
                'Última Actividad': formatDate(r.lastActivity),
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Resumen Masivo');
        XLSX.writeFile(wb, `crypto_masivo_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // ── Masivo: export PDFs ────────────────────────────────────────────────────
    const exportarMasivoPDFs = () => {
        masivoItems
            .filter(it => it.status === 'done' && it.result)
            .forEach(it => generateCryptoPdf(it.result!));
    };

    const hasDoneItems = masivoItems.some(it => it.status === 'done');
    const doneCount = masivoItems.filter(it => it.status === 'done').length;
    const errorCount = masivoItems.filter(it => it.status === 'error').length;
    const completedCount = doneCount + errorCount;

    // ── SearchBar (individual mode) ────────────────────────────────────────────
    const SearchBar = ({ centered = false }) => (
        <div className={`w-full transition-all duration-300 ${centered ? 'max-w-2xl mx-auto' : 'max-w-full'}`}>
            <div className="relative flex items-center w-full h-16 rounded-2xl bg-white shadow-lg shadow-slate-200/50 border border-slate-200 overflow-hidden">
                <div className="pl-5 pr-3">
                    <IconWallet className="w-6 h-6 text-slate-400" />
                </div>
                <input
                    className="h-full w-full outline-none text-base text-slate-700 placeholder-slate-400"
                    type="text"
                    placeholder="Ingresa una dirección de Billetera..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <select
                    className="bg-slate-100 h-full text-xs font-bold text-slate-600 outline-none cursor-pointer uppercase px-3 hover:bg-slate-200 transition-colors"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value as any)}
                >
                    <option value="AUTO">Auto-Detectar</option>
                    <option value="BTC">Bitcoin</option>
                    <option value="ETH">Ethereum</option>
                    <option value="TRON">Tron</option>
                    <option value="BSC">BNB Chain</option>
                    <option value="POLYGON">Polygon</option>
                    <option value="XRP">XRP</option>
                    <option value="SOL">Solana</option>
                    <option value="ARB">Arbitrum</option>
                    <option value="OP">Optimism</option>
                    <option value="BASE">Base</option>
                    <option value="AVAX">Avalanche</option>
                    <option value="FTM">Fantom</option>
                    <option value="CELO">Celo</option>
                </select>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="h-full px-4 text-slate-500 hover:bg-slate-100 transition-colors">
                    <IconCamera className="w-6 h-6" />
                </button>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
                <button
                    onClick={handleSearch}
                    disabled={loading || !hasValidApiKeys()}
                    className="h-full bg-primary-600 hover:bg-primary-700 text-white font-bold px-8 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    {loading ? <LoadingSpinner mini /> : <IconSearch className="w-5 h-5"/>}
                </button>
            </div>
            {!hasValidApiKeys() && <p className="text-xs text-red-500 text-center mt-2">Se requiere una API Key de Gemini para activar el botón de análisis.</p>}
        </div>
    );

    // ── Mode toggle pill ───────────────────────────────────────────────────────
    const ModeToggle = () => (
        <div className="flex items-center justify-center gap-1 bg-slate-100 p-1 rounded-xl w-fit mx-auto mb-6">
            <button
                onClick={() => setMode('individual')}
                className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                    mode === 'individual'
                        ? 'bg-white text-primary-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                Busqueda Individual
            </button>
            <button
                onClick={() => setMode('masivo')}
                className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                    mode === 'masivo'
                        ? 'bg-white text-primary-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                Modo Masivo
            </button>
        </div>
    );

    // ── Masivo UI ──────────────────────────────────────────────────────────────
    const MasivoPanel = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Upload area */}
            <div
                className="border-2 border-dashed border-slate-300 hover:border-primary-400 rounded-2xl p-10 text-center cursor-pointer transition-colors bg-white"
                onClick={() => masivoFileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && masivoFileRef.current) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        masivoFileRef.current.files = dt.files;
                        handleMasivoFile({ target: masivoFileRef.current } as any);
                    }
                }}
            >
                <div className="text-4xl mb-3">📂</div>
                <p className="text-base font-semibold text-slate-700">Arrastra tu Excel aquí o haz clic para seleccionar</p>
                <p className="text-sm text-slate-400 mt-1">Columna requerida: <code className="bg-slate-100 px-1 rounded">wallet</code> (una dirección por fila)</p>
                <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    ref={masivoFileRef}
                    onChange={handleMasivoFile}
                    className="hidden"
                />
            </div>

            {masivoError && (
                <Alert type="error" message={masivoError} onClose={() => setMasivoError(null)} />
            )}

            {/* Loaded count + clear */}
            {masivoItems.length > 0 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-600">
                        <span className="font-bold text-slate-800">{masivoItems.length}</span> direcciones cargadas
                    </p>
                    <button
                        onClick={() => { setMasivoItems([]); setExpandedRow(null); }}
                        disabled={masivoRunning}
                        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40"
                    >
                        Limpiar lista
                    </button>
                </div>
            )}

            {/* Queue table */}
            {masivoItems.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-600">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 w-12">#</th>
                                    <th className="px-4 py-3">Wallet</th>
                                    <th className="px-4 py-3 w-28">Red</th>
                                    <th className="px-4 py-3 w-32">Estado</th>
                                    <th className="px-4 py-3 w-24">Riesgo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {masivoItems.map((item, idx) => (
                                    <React.Fragment key={item.id}>
                                        <tr
                                            className={`border-b border-slate-100 transition-colors ${
                                                item.status === 'done' ? 'cursor-pointer hover:bg-indigo-50' : ''
                                            } ${expandedRow === item.id ? 'bg-indigo-50' : 'bg-white'}`}
                                            onClick={() => item.status === 'done' && setExpandedRow(expandedRow === item.id ? null : item.id)}
                                        >
                                            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {item.wallet.length > 20
                                                    ? `${item.wallet.slice(0, 10)}...${item.wallet.slice(-8)}`
                                                    : item.wallet}
                                                {item.status === 'error' && (
                                                    <span className="ml-2 text-red-500 text-xs" title={item.error}>⚠ {item.error?.slice(0, 40)}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.detectedNetwork
                                                    ? <span className="inline-block bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded">{item.detectedNetwork}</span>
                                                    : <span className="text-slate-300 text-xs">—</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3"><StatusChip status={item.status} /></td>
                                            <td className="px-4 py-3">
                                                {item.result?.riskAssessment ? (
                                                    <span className={`text-xs font-bold ${RISK_COLORS[item.result.riskAssessment.riskLevel] || ''}`}>
                                                        {item.result.riskAssessment.riskLevel} ({item.result.riskAssessment.riskScore})
                                                    </span>
                                                ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                        </tr>
                                        {/* Expanded row */}
                                        {expandedRow === item.id && item.result && (
                                            <tr key={`${item.id}-expanded`}>
                                                <td colSpan={5} className="px-4 py-6 bg-indigo-50/60">
                                                    <WalletReportCard
                                                        data={item.result}
                                                        onPrint={() => generateCryptoPdf(item.result!)}
                                                        patternResult={null}
                                                        isAnalyzingPatterns={false}
                                                        onAnalyzePatterns={() => {}}
                                                    />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Progress bar */}
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>{completedCount} / {masivoItems.length} completados{errorCount > 0 ? `, ${errorCount} errores` : ''}</span>
                            <span>{masivoItems.length > 0 ? Math.round((completedCount / masivoItems.length) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                                className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${masivoItems.length > 0 ? (completedCount / masivoItems.length) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Control buttons */}
            {masivoItems.length > 0 && (
                <div className="flex flex-wrap gap-3 items-center">
                    {!masivoRunning && (
                        <button
                            onClick={procesarMasivo}
                            disabled={masivoItems.every(it => it.status !== 'pending')}
                            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                        >
                            ▶ Iniciar
                        </button>
                    )}

                    {masivoRunning && !masivoIsPaused && (
                        <button
                            onClick={pauseMasivo}
                            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                        >
                            ⏸ Pausar
                        </button>
                    )}

                    {masivoRunning && masivoIsPaused && (
                        <button
                            onClick={resumeMasivo}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                        >
                            ▶ Reanudar
                        </button>
                    )}

                    {masivoRunning && (
                        <button
                            onClick={stopMasivo}
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                        >
                            ⏹ Detener
                        </button>
                    )}

                    {hasDoneItems && (
                        <>
                            <button
                                onClick={exportarMasivoExcel}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                                Exportar Excel
                            </button>
                            <button
                                onClick={exportarMasivoPDFs}
                                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                                PDFs
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );

    // ── Render ─────────────────────────────────────────────────────────────────

    // Landing screen (individual, first visit)
    if (!hasSearched && mode === 'individual') {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-4 animate-fade-in">
                <div className="text-center mb-8">
                    <IconShieldCheck className="w-16 h-16 text-primary-500 mx-auto mb-4"/>
                    <h2 className="text-3xl font-bold text-slate-800">Análisis Forense de Criptoactivos</h2>
                    <p className="text-slate-500 mt-2">Investiga billeteras, rastrea transacciones y evalúa riesgos con IA.</p>
                </div>
                <ModeToggle />
                <SearchBar centered />
                {error && <div className="mt-4 w-full max-w-2xl"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto pb-12 animate-fade-in">
            {/* Mode toggle always visible at top */}
            <ModeToggle />

            {/* Individual mode */}
            {mode === 'individual' && (
                <>
                    <div className="sticky top-4 z-40 bg-slate-50/80 backdrop-blur-lg p-2 -mx-2 rounded-2xl mb-6">
                        <SearchBar />
                    </div>
                    {loading && (
                        <div className="flex flex-col items-center justify-center p-10 bg-white rounded-xl border border-slate-200 shadow-sm">
                            <LoadingSpinner />
                            <p className="text-slate-600 font-medium mt-4 text-center">{loadingStep}</p>
                            <p className="text-xs text-slate-400 mt-1">Esto puede tardar unos segundos...</p>
                        </div>
                    )}
                    {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                    {walletData && !loading && (
                        <AnalysisDashboard
                            data={walletData}
                            onPrint={() => generateCryptoPdf(walletData)}
                            patternResult={patternResult}
                            isAnalyzingPatterns={isAnalyzingPatterns}
                            onAnalyzePatterns={handleAnalyzePatterns}
                        />
                    )}
                </>
            )}

            {/* Masivo mode */}
            {mode === 'masivo' && <MasivoPanel />}
        </div>
    );
};
