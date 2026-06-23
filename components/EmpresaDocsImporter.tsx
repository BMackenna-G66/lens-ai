import React, { useState } from 'react';
import { BatchCompanyInput } from '../types/batch';
import { EmpresaDocsSearchResult } from '../types/empresaDocs';
import { searchEmpresaDocs } from '../services/empresaDocsClient';
import { fromEmpresaDocs } from '../services/batchInputNormalizer';

interface Props {
  onCompaniesReady: (companies: BatchCompanyInput[]) => void;
}

type ImportPhase = 'idle' | 'searching' | 'results' | 'importing' | 'done';

export const EmpresaDocsImporter: React.FC<Props> = ({ onCompaniesReady }) => {
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Search fields
  const [companyId, setCompanyId] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');

  // Results
  const [results, setResults] = useState<EmpresaDocsSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import progress
  const [importTotal, setImportTotal] = useState(0);
  const [importDone, setImportDone] = useState(0);
  const [importLabel, setImportLabel] = useState('');

  const canSearch = companyId || dni || email || country;

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

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map(r => String(r.id))));
    }
  };

  const handleImport = async () => {
    const toImport = results.filter(r => selected.has(String(r.id)));
    if (toImport.length === 0) return;

    setPhase('importing');
    setImportTotal(toImport.length);
    setImportDone(0);
    setError(null);

    const imported: BatchCompanyInput[] = [];
    for (const company of toImport) {
      setImportLabel(`Importando ${company.name}...`);
      try {
        const batch = await fromEmpresaDocs(company);
        imported.push(batch);
      } catch (err) {
        // Add with zero docs + error so the batch shows it as failed
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

      {/* ── Search form ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar empresa en EmpresaDocs</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Company ID', value: companyId, setter: setCompanyId, placeholder: 'ej: 12345' },
            { label: 'RUT / DNI', value: dni, setter: setDni, placeholder: 'ej: 76.543.210-K' },
            { label: 'Email',      value: email, setter: setEmail, placeholder: 'contacto@empresa.cl' },
            { label: 'País',       value: country, setter: setCountry, placeholder: 'ej: Chile' },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{f.label}</label>
              <input
                type="text"
                value={f.value}
                onChange={e => f.setter(e.target.value)}
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
            disabled={!canSearch || phase === 'searching'}
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

      {/* ── Results table ── */}
      {(phase === 'results' || phase === 'importing' || phase === 'done') && results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {results.length} resultado{results.length !== 1 ? 's' : ''}
              {selected.size > 0 && <span className="ml-2 text-indigo-600 dark:text-indigo-400">· {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>}
            </span>
            {phase === 'importing' && (
              <span className="text-xs text-blue-600 dark:text-blue-400 animate-pulse font-semibold">{importLabel} ({importDone}/{importTotal})</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
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
                  const isSelected = selected.has(id);
                  return (
                    <tr
                      key={id}
                      onClick={() => phase === 'results' && toggleSelect(id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
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
                          : <span className="text-slate-400">—</span>
                        }
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
              <button
                onClick={handleImport}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-950"
              >
                📥 Importar {selected.size} empresa{selected.size !== 1 ? 's' : ''} al Batch
              </button>
            </div>
          )}

          {phase === 'importing' && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
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
