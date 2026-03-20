
import React, { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { analyzeCryptoRisk } from '../services/geminiService';
import { CryptoAnalysisResult } from '../types';

interface LensCryptoProps {
  isApiKeyOk: boolean;
}

type RiskLevel = 'Bajo' | 'Medio' | 'Alto' | 'Crítico';

const riskBadgeClasses: Record<RiskLevel, string> = {
  Bajo: 'bg-green-100 text-green-800 border border-green-300',
  Medio: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  Alto: 'bg-orange-100 text-orange-800 border border-orange-300',
  Crítico: 'bg-red-100 text-red-800 border border-red-300',
};

export const LensCrypto: React.FC<LensCryptoProps> = ({ isApiKeyOk }) => {
  const [blockchain, setBlockchain] = useState<string>('Bitcoin');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [transactionData, setTransactionData] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CryptoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress.trim() && !transactionData.trim()) {
      setError('Por favor, ingresa al menos una dirección de wallet o datos de transacción para analizar.');
      return;
    }
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const data = await analyzeCryptoRisk(walletAddress.trim(), blockchain, transactionData.trim());
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Error desconocido al analizar el riesgo cripto.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white rounded-lg shadow-lg border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-800 mb-1">Lens - Análisis de Criptoactivos</h2>
        <p className="text-sm text-slate-500 mb-5">
          Evalúa el riesgo regulatorio de wallets y transacciones en criptomonedas conforme a estándares VASP y FATF Travel Rule para Latinoamérica.
        </p>

        {!isApiKeyOk && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            La API Key de Gemini no está configurada. Esta funcionalidad no estará disponible.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="crypto-blockchain" className="block text-sm font-medium text-slate-700 mb-1">
              Blockchain
            </label>
            <select
              id="crypto-blockchain"
              value={blockchain}
              onChange={(e) => setBlockchain(e.target.value)}
              className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
            >
              <option>Bitcoin</option>
              <option>Ethereum</option>
              <option>BNB Chain</option>
              <option>Polygon</option>
              <option>Tron</option>
              <option>Solana</option>
            </select>
          </div>

          <div>
            <label htmlFor="crypto-wallet" className="block text-sm font-medium text-slate-700 mb-1">
              Dirección de Wallet
            </label>
            <input
              id="crypto-wallet"
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Ej: 1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na..."
              className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition font-mono text-sm"
            />
          </div>

          <div>
            <label htmlFor="crypto-txdata" className="block text-sm font-medium text-slate-700 mb-1">
              Datos de Transacción <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <textarea
              id="crypto-txdata"
              value={transactionData}
              onChange={(e) => setTransactionData(e.target.value)}
              rows={6}
              placeholder="Pega aquí información de transacciones, historial de la wallet, hash de transacciones, montos, exchanges involucrados u otros datos relevantes..."
              className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition resize-none font-mono text-sm"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !isApiKeyOk}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-lg shadow-md transition duration-150 ease-in-out"
          >
            {isLoading ? (
              <>
                <LoadingSpinner mini />
                <span>Analizando...</span>
              </>
            ) : (
              <span>Analizar Wallet</span>
            )}
          </button>
        </form>
      </div>

      {result && (
        <div className="p-6 bg-white rounded-lg shadow-lg border border-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Resultado del Análisis</h3>

          <div className="flex flex-wrap gap-3 items-center">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${riskBadgeClasses[result.nivelRiesgo]}`}>
              Riesgo: {result.nivelRiesgo}
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Resumen Ejecutivo</p>
            <p className="text-slate-800 text-sm leading-relaxed">{result.resumenRiesgo}</p>
          </div>

          {result.patronesSospechosos && result.patronesSospechosos.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Patrones Sospechosos Analizados</p>
              <ul className="space-y-2">
                {result.patronesSospechosos.map((patron, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 text-base font-bold ${patron.detectado ? 'text-red-500' : 'text-green-500'}`}>
                      {patron.detectado ? '✗' : '✓'}
                    </span>
                    <span className="text-sm text-slate-700">{patron.descripcion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Cumplimiento VASP / FATF Travel Rule</p>
            <p className="text-slate-800 text-sm leading-relaxed">{result.cumplimientoVASP}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Análisis de Jurisdicción</p>
            <p className="text-slate-800 text-sm leading-relaxed">{result.jurisdiccion}</p>
          </div>

          {result.recomendaciones && result.recomendaciones.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recomendaciones</p>
              <ul className="space-y-1.5">
                {result.recomendaciones.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="text-primary-500 mt-0.5 shrink-0">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
