import React, { useState, useEffect } from 'react';
import { BatchCompanyInput } from '../types/batch';
import { EmpresaDocsSearchResult } from '../types/empresaDocs';
import { searchEmpresaDocs } from '../services/empresaDocsClient';
import {
  setSsoRefreshToken,
  setBasicRefreshToken,
  clearTokens,
  getTokenStatus,
  hasAnyToken,
  getIdToken,
} from '../services/empresaDocsAuth';
import { fromEmpresaDocs } from '../services/batchInputNormalizer';

interface Props {
  onCompaniesReady: (companies: BatchCompanyInput[]) => void;
}

type ImportPhase = 'idle' | 'searching' | 'results' | 'importing' | 'done';

// ─── Token Setup Panel ────────────────────────────────────────────────────────

const TokenSetup: React.FC<{ onStatusChange: () => void }> = ({ onStatusChange }) => {
  const [open, setOpen]         = useState(false);
  const [ssoInput, setSsoInput] = useState('');
  const [rtInput, setRtInput]   = useState('');
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const status = getTokenStatus();

  const handleSaveSso = () => {
    if (!ssoInput.trim()) return;
    setSsoRefreshToken(ssoInput.trim());
    setSsoInput('');
    setTestResult(null);
    onStatusChange();
  };

  const handleSaveBasic = () => {
    if (!rtInput.trim()) return;
    setBasicRefreshToken(rtInput.trim());
    setRtInput('');
    setTestResult(null);
    onStatusChange();
  };

  const handleClear = () => {
    clearTokens();
    setTestResult(null);
    onStatusChange();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await getIdToken(true);
      setTestResult({ ok: true, msg: 'Conexión exitosa — ID Token obtenido correctamente.' });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'Error desconocido' });
    }
    setTesting(false);
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">🔑 Autenticación EmpresaDocs</span>
          {status.sso
            ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">SSO activo</span>
            : status.basic
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Token básico</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Sin token</span>
          }
        </div>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white dark:bg-slate-900">

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <p className="font-semibold">Cómo obtener el Refresh Token SSO:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Abre la app de Global66 en el navegador</li>
              <li>Abre DevTools → pestaña Network</li>
              <li>Realiza cualquier acción que dispare un request a <code className="font-mono">/admin/refresh-token</code></li>
              <li>En la pestaña Payload del request, copia el valor de <code className="font-mono">refreshToken</code></li>
            </ol>
          </div>

          {/* SSO Token (recommended) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Refresh Token SSO <span className="text-green-600 dark:text-green-400 font-normal">(recomendado — permite búsqueda por DNI y email)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={ssoInput}
                onChange={e => setSsoInput(e.target.value)}
                placeholder={status.sso ? '••••••••••••• (guardado)' : 'Pega el SSO Refresh Token aquí'}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={handleSaveSso}
                disabled={!ssoInput.trim()}
                className="px-3 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>

          {/* Basic Refresh Token */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Refresh Token básico <span className="text-slate-400 font-normal">(permisos limitados — búsqueda solo por Company ID)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={rtInput}
                onChange={e => setRtInput(e.target.value)}
                placeholder={status.basic ? '••••••••••••• (guardado)' : 'Pega el Refresh Token aquí'}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={handleSaveBasic}
                disabled={!rtInput.trim()}
                className="px-3 py-2 text-xs font-semibold bg-slate-600 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>

          {/* Test + Clear */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={!hasAnyToken() || testing}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              {testing ? '⏳ Probando...' : '✓ Probar conexión'}
            </button>
            {(status.sso || status.basic) && (
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
              >
                Eliminar tokens
              </button>
            )}
          </div>

          {testResult && (
            <p className={`text-xs px-3 py-2 rounded-lg ${
              testResult.ok
                ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
            }`}>
              {testResult.ok ? '✅ ' : '❌ '}{testResult.msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main importer component ──────────────────────────────────────────────────

export const EmpresaDocsImporter: React.FC<Props> = ({ onCompaniesReady }) => {
  const [phase, setPhase]       = useState<ImportPhase>('idle');
  const [error, setError]       = useState<string | null>(null);
  const [tokenOk, setTokenOk]   = useState(hasAnyToken());

  // Search fields
  const [companyId, setCompanyId] = useState('');
  const [dni, setDni]             = useState('');
  const [email, setEmail]         = useState('');
  const [country, setCountry]     = useState('');

  // Results
  const [results, setResults]   = useState<EmpresaDocsSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import progress
  const [importTotal, setImportTotal] = useState(0);
  const [importDone, setImportDone]   = useState(0);
  const [importLabel, setImportLabel] = useState('');

  // Re-check token whenever component re-renders after token save
  useEffect(() => { setTokenOk(hasAnyToken()); }, []);

  const canSearch = !!(companyId || dni || email || country);

  const handleSearch = async () => {
    if (!canSearch) return;
    setError(null);
    setPhase('searching');
    setSelected(new Set());
    try {
      const res = await searchEmpresaDocs({ companyId, dni, email, country });
      setResults(res);
      setPhase('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la búsqueda');
      setPhase('idle');
    }
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      selected.size === results.length
        ? new Set()
        : new Set(results.map(r => String(r.id)))
    );

  const handleImport = async () => {
    const toImport = results.filter(r => selected.has(String(r.id)));
    if (toImport.length === 0) return;

    setPhase('importing');
    setImportTotal(toImport.length);
    setImportDone(0);
    setError(null);

    const imported: BatchCompanyInput[] = [];
    for (const company of toImport) {
      setImportLabel(`Descargando documentos de ${company.name}...`);
      try {
        imported.push(await fromEmpresaDocs(company));
      } catch {
        // Add with zero docs so the batch shows it as failed
        imported.push({
          id: crypto.randomUUID(),
          companyName: company.name,
          companyId: String(company.id),
          identificationNumber: company.identificationNumber,
          country: company.country,
          source: 'empresa_docs',
          documents: [],
        });
      }
      setImportDone(d => d + 1);
    }

    setPhase('done');
    onCompaniesReady(imported);
  };

  const handleReset = () => {
    setPhase('idle');
    setResults([]);
    setSelected(new Set());
    setError(null);
    setCompanyId('');
    setDni('');
    setEmail('');
    setCountry('');
  };

  return (
    <div className="space-y-4">

      {/* Token setup — always visible, collapsed by default when token is active */}
      <TokenSetup onStatusChange={() => setTokenOk(hasAnyToken())} />

      {/* No-token warning */}
      {!tokenOk && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ Configura el Refresh Token SSO arriba antes de buscar empresas.
        </div>
      )}

      {/* Search form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar empresa en EmpresaDocs</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { label: 'Company ID',  value: companyId, setter: setCompanyId, placeholder: 'ej: 4031569',          note: '' },
            { label: 'RUT / DNI',   value: dni,       setter: setDni,       placeholder: 'ej: 76.543.210-K',    note: 'Requiere SSO' },
            { label: 'Email',       value: email,     setter: setEmail,     placeholder: 'contacto@empresa.cl', note: 'Requiere SSO' },
            { label: 'País',        value: country,   setter: setCountry,   placeholder: 'CL, CO, PE…',         note: 'Opcional' },
          ] as const).map(f => (
            <div key={f.label}>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {f.label}
                {f.note && <span className="ml-1 text-[10px] text-slate-400">({f.note})</span>}
              </label>
              <input
                type="text"
                value={f.value}
                onChange={e => (f.setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                placeholder={f.placeholder}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSearch}
            disabled={!canSearch || !tokenOk || phase === 'searching'}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {phase === 'searching' ? '🔍 Buscando...' : '🔍 Buscar'}
          </button>
          {phase !== 'idle' && (
            <button onClick={handleReset} className="px-4 py-2 text-sm text-slate-500 hover:text-red-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
              ✕ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Results table */}
      {(phase === 'results' || phase === 'importing' || phase === 'done') && results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {results.length} resultado{results.length !== 1 ? 's' : ''}
              {selected.size > 0 && (
                <span className="ml-2 text-indigo-600 dark:text-indigo-400">
                  · {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
                </span>
              )}
            </span>
            {phase === 'importing' && (
              <span className="text-xs text-blue-600 dark:text-blue-400 animate-pulse font-semibold">
                {importLabel} ({importDone}/{importTotal})
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox"
                      checked={selected.size === results.length && results.length > 0}
                      onChange={toggleAll}
                      disabled={phase !== 'results'}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold">Empresa</th>
                  <th className="px-3 py-2 font-semibold">Company ID</th>
                  <th className="px-3 py-2 font-semibold">RUT / DNI</th>
                  <th className="px-3 py-2 font-semibold">País</th>
                  <th className="px-3 py-2 font-semibold">Compliance</th>
                  <th className="px-3 py-2 font-semibold text-right">Docs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {results.map(r => {
                  const id = String(r.id);
                  const isSel = selected.has(id);
                  return (
                    <tr key={id}
                      onClick={() => phase === 'results' && toggleSelect(id)}
                      className={`cursor-pointer transition-colors ${isSel ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={isSel}
                          onChange={() => toggleSelect(id)}
                          disabled={phase !== 'results'}
                          onClick={e => e.stopPropagation()}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.id}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.identificationNumber ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.country ?? '—'}</td>
                      <td className="px-3 py-2">
                        {r.complianceStatus
                          ? <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold">{r.complianceStatus}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{r.documentsCount ?? '?'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {phase === 'results' && selected.size > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              <button onClick={handleImport}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-950"
              >
                📥 Importar {selected.size} empresa{selected.size !== 1 ? 's' : ''} al Batch
              </button>
            </div>
          )}

          {phase === 'importing' && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${importTotal > 0 ? Math.round((importDone / importTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-green-600 dark:text-green-400 font-semibold">
                ✅ {importDone} empresa{importDone !== 1 ? 's' : ''} importada{importDone !== 1 ? 's' : ''} — continúa abajo para iniciar el análisis
              </p>
            </div>
          )}
        </div>
      )}

      {phase === 'results' && results.length === 0 && (
        <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
          Sin resultados para los criterios ingresados.
        </div>
      )}
    </div>
  );
};
