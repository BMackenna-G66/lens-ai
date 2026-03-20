
import React, { useState } from 'react';
import { useApiKey } from '../context/ApiKeyContext';
import { LoadingSpinner } from './LoadingSpinner';
import { IconAlertTriangle, IconCheckCircle, IconExternalLink } from './IconComponents';

export const ApiKeyModal: React.FC = () => {
  const { setApiKey } = useApiKey();
  const [keyInput, setKeyInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSave = async () => {
    if (!keyInput.trim()) {
      setErrorMessage('La API Key no puede estar vacía.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMessage('');
    const isValid = await setApiKey(keyInput);
    if (isValid) {
      setStatus('success');
    } else {
      setErrorMessage('La API Key no es válida o no tiene los permisos necesarios.');
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 transform transition-all animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Configuración de API Key</h2>
        <p className="text-slate-600 mb-6">
          Para utilizar LENS - AI, necesitas tu propia API Key de Google Gemini. La llave se guardará de forma segura en tu navegador.
        </p>

        <div className="mb-4">
          <label htmlFor="api-key-input" className="block text-sm font-medium text-slate-700 mb-1">
            Tu API Key de Google Gemini
          </label>
          <input
            id="api-key-input"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Pega tu API Key aquí"
            className="w-full border border-slate-300 rounded-lg p-3 text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
            aria-describedby="api-key-error"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={status === 'loading'}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-wait"
        >
          {status === 'loading' ? (
            <>
              <LoadingSpinner mini />
              <span className="ml-2">Validando...</span>
            </>
          ) : (
            'Guardar y Validar'
          )}
        </button>

        <div className="mt-4 min-h-[20px] text-sm text-center">
            {status === 'error' && (
                <p id="api-key-error" className="text-red-600 flex items-center justify-center">
                    <IconAlertTriangle className="w-4 h-4 mr-1" /> {errorMessage}
                </p>
            )}
            {status === 'success' && (
                <p className="text-green-600 flex items-center justify-center">
                    <IconCheckCircle className="w-4 h-4 mr-1" /> ¡API Key guardada y validada!
                </p>
            )}
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 border-t border-slate-200 pt-4">
          <p>
            ¿No tienes una API Key?
            <a
              href="https://ai.google.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary-600 hover:underline ml-1 inline-flex items-center"
            >
              Obtenla aquí <IconExternalLink className="w-3 h-3 ml-1" />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
