
import React, { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { analyzeAML } from '../services/geminiService';
import { AMLResult } from '../types';

interface EvaluadorAMLProps {
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

const scoreToRiskLevel = (score: number): RiskLevel => {
  if (score < 25) return 'Bajo';
  if (score < 50) return 'Medio';
  if (score < 75) return 'Alto';
  return 'Crítico';
};

export const EvaluadorAML: React.FC<EvaluadorAMLProps> = ({ isApiKeyOk }) => {
  const [entityType, setEntityType] = useState<string>('Persona Natural');
  const [country, setCountry] = useState<string>('Chile');
  const [documentText, setDocumentText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AMLResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentText.trim()) {
      setError('Por favor, ingresa la información de la entidad a evaluar.');
      return;
    }
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const data = await analyzeAML(documentText.trim(), entityType, country);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Error desconocido al realizar la evaluación AML.');
    } finally {
      setIsLoading(false);
    }
  };

  const scoreLevel = result ? (result.nivelRiesgo || scoreToRiskLevel(result.puntuacion)) : null;

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white rounded-lg shadow-lg border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-800 mb-1">Evaluador AML / CFT</h2>
        <p className="text-sm text-slate-500 mb-5">
          Realiza una evaluación de prevención de lavado de activos y financiamiento del terrorismo (AML/CFT) basada en el perfil de la entidad.
        </p>

        {!isApiKeyOk && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            La API Key de Gemini no está configurada. Esta funcionalidad no estará disponible.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="aml-entity-type" className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de Entidad
              </label>
              <select
                id="aml-entity-type"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
              >
                <option>Persona Natural</option>
                <option>Persona Jurídica</option>
                <option>Fideicomiso</option>
                <option>Fondo de Inversión</option>
              </select>
            </div>

            <div>
              <label htmlFor="aml-country" className="block text-sm font-medium text-slate-700 mb-1">
                País
              </label>
              <select
                id="aml-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-slate-100 border border-slate-300 rounded-lg py-2.5 px-3 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
              >
                <option>Chile</option>
                <option>Colombia</option>
                <option>Peru</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="aml-document" className="block text-sm font-medium text-slate-700 mb-1">
              Información de la Entidad / Texto del Documento
            </label>
            <textarea
              id="aml-document"
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              rows={8}
              placeholder="Pega aquí el texto del documento o la información de la entidad a evaluar: nombre, actividad económica, origen de fondos, estructura societaria, países relacionados, historial transaccional, etc."
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
              <span>Evaluar Riesgo AML</span>
            )}
          </button>
        </form>
      </div>

      {result && scoreLevel && (
        <div className="p-6 bg-white rounded-lg shadow-lg border border-slate-200 space-y-5">
          <h3 className="text-lg font-semibold text-slate-800">Resultado de la Evaluación AML</h3>

          {/* Score gauge */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Puntuación de Riesgo</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${riskBadgeClasses[scoreLevel]}`}>
                {result.nivelRiesgo} — {result.puntuacion}/100
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-700 ease-out ${riskBarColor[scoreLevel]}`}
                style={{ width: `${Math.min(100, Math.max(0, result.puntuacion))}%` }}
                role="progressbar"
                aria-valuenow={result.puntuacion}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>0 — Bajo</span>
              <span>25 — Medio</span>
              <span>50 — Alto</span>
              <span>75+ — Crítico</span>
            </div>
          </div>

          {/* Indicadores de riesgo */}
          {result.indicadoresRiesgo && result.indicadoresRiesgo.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Indicadores de Riesgo</p>
              <ul className="space-y-3">
                {result.indicadoresRiesgo.map((indicador, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 text-base font-bold ${indicador.detectado ? 'text-red-500' : 'text-green-500'}`}>
                      {indicador.detectado ? '✗' : '✓'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{indicador.tipo}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{indicador.descripcion}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Señales de alerta */}
          {result.senalesAlerta && result.senalesAlerta.length > 0 && (
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Señales de Alerta</p>
              <ul className="space-y-1.5">
                {result.senalesAlerta.map((alerta, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-red-700">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    <span>{alerta}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Perfil de riesgo */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Perfil de Riesgo</p>
            <p className="text-slate-800 text-sm leading-relaxed">{result.perfilRiesgo}</p>
          </div>

          {/* Recomendaciones */}
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
