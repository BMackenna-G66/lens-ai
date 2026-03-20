
import React, { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { analyzeLimitesTransaccionales } from '../services/geminiService';
import { LimitesResult } from '../types';

interface LimitesTransaccionalesProps {
  isApiKeyOk: boolean;
}

type RiskLevel = 'Bajo' | 'Medio' | 'Alto' | 'Crítico';

const riskBadgeClasses: Record<RiskLevel, string> = {
  Bajo: 'bg-green-100 text-green-800 border border-green-300',
  Medio: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  Alto: 'bg-orange-100 text-orange-800 border border-orange-300',
  Crítico: 'bg-red-100 text-red-800 border border-red-300',
};

const riskBarColor: Record<RiskLevel, string> = {
  Bajo: 'bg-green-500',
  Medio: 'bg-yellow-500',
  Alto: 'bg-orange-500',
  Crítico: 'bg-red-500',
};

export const LimitesTransaccionales: React.FC<LimitesTransaccionalesProps> = ({ isApiKeyOk }) => {
  const [country, setCountry] = useState<string>('Chile');
  const [transactionType, setTransactionType] = useState<string>('Transferencia bancaria');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('CLP');
  const [description, setDescription] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<LimitesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Por favor, ingresa un monto válido mayor que cero.');
      return;
    }
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const data = await analyzeLimitesTransaccionales(country, transactionType, amount, currency, description);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Error desconocido al evaluar la transacción.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white rounded-lg shadow-lg border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-800 mb-1">Evaluador de Límites Transaccionales</h2>
        <p className="text-sm text-slate-500 mb-5">
          Evalúa si una transacción cumple con los límites regulatorios vigentes en Chile, Colombia o Perú según la UAF, UIAF o UIF.
        </p>

        {!isApiKeyOk && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            La API Key de Gemini no está configurada. Esta funcionalidad no estará disponible.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="lt-country" className="block text-sm font-medium text-slate-700 mb-1">
                País
              </label>
              <select
                id="lt-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
              >
                <option>Chile</option>
                <option>Colombia</option>
                <option>Peru</option>
              </select>
            </div>

            <div>
              <label htmlFor="lt-type" className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de Transacción
              </label>
              <select
                id="lt-type"
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
              >
                <option>Transferencia bancaria</option>
                <option>Depósito en efectivo</option>
                <option>Retiro en efectivo</option>
                <option>Pago de cheque</option>
                <option>Compraventa de divisas</option>
                <option>Operación con criptomonedas</option>
                <option>Compraventa de bienes raíces</option>
              </select>
            </div>

            <div>
              <label htmlFor="lt-amount" className="block text-sm font-medium text-slate-700 mb-1">
                Monto
              </label>
              <input
                id="lt-amount"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ej: 5000000"
                className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
              />
            </div>

            <div>
              <label htmlFor="lt-currency" className="block text-sm font-medium text-slate-700 mb-1">
                Moneda
              </label>
              <select
                id="lt-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
              >
                <option>CLP</option>
                <option>COP</option>
                <option>PEN</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="lt-description" className="block text-sm font-medium text-slate-700 mb-1">
              Descripción <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <textarea
              id="lt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe el contexto o propósito de la transacción..."
              className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition resize-none"
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
                <span>Evaluando...</span>
              </>
            ) : (
              <span>Evaluar Transacción</span>
            )}
          </button>
        </form>
      </div>

      {result && (
        <div className="p-6 bg-white rounded-lg shadow-lg border border-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Resultado de la Evaluación</h3>

          <div className="flex flex-wrap gap-3 items-center">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${riskBadgeClasses[result.nivelRiesgo]}`}>
              Riesgo: {result.nivelRiesgo}
            </span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${result.cumple ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
              {result.cumple ? '✓ Cumple los límites' : '✗ No cumple los límites'}
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Límite Aplicable</p>
              <p className="text-slate-800 text-sm">{result.limiteAplicable}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Regulación de Referencia</p>
              <p className="text-slate-800 text-sm">{result.regulacionReferencia}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observaciones</p>
              <p className="text-slate-800 text-sm leading-relaxed">{result.observaciones}</p>
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
        </div>
      )}
    </div>
  );
};
