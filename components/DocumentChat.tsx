
import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { ChatMessage } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { IconAlertTriangle, IconChatBubbleLeftRight } from './IconComponents';

interface DocumentChatProps {
  documentId: string;
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  chatError?: string | null;
  onSendMessage: (messageText: string) => void;
}

const suggestedQuestions = [
  "¿Cuál es el objeto social de la empresa?",
  "¿Quién es el representante legal?",
  "¿Cuál es el capital social?",
  "¿Hay modificaciones en este documento?",
  "¿Cuáles son las facultades del administrador?",
  "Resume los puntos más importantes",
  "¿Hay cláusulas sospechosas?",
  "¿Cuál es la fecha de constitución?",
];

export const DocumentChat: React.FC<DocumentChatProps> = ({
  chatMessages,
  isChatLoading,
  chatError,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const [screenshotting, setScreenshotting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatMessages]);

  const handleSend = (textOverride?: string) => {
    const text = textOverride !== undefined ? textOverride : inputText.trim();
    if (text && !isChatLoading) {
      onSendMessage(text);
      setInputText('');
    }
  };

  const handleChipClick = (question: string) => {
    if (!isChatLoading) {
      handleSend(question);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleScreenshot = async () => {
    if (!chatPanelRef.current) return;
    setScreenshotting(true);
    try {
      const canvas = await html2canvas(chatPanelRef.current, {
        backgroundColor: '#f1f5f9',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `chat_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // silent — screenshot failed
    } finally {
      setScreenshotting(false);
    }
  };

  return (
    <div ref={chatPanelRef} className="mt-2 p-3 bg-slate-100/70 rounded-lg shadow-inner flex flex-col h-[750px] max-h-[87vh]">
      {/* Panel header with screenshot button */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-300/60">
        <div className="flex items-center gap-1.5 text-slate-500">
          <IconChatBubbleLeftRight className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Chat con documento</span>
        </div>
        <button
          onClick={handleScreenshot}
          disabled={screenshotting || chatMessages.length === 0}
          title="Descargar screenshot del chat"
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {screenshotting ? (
            <LoadingSpinner mini={true} />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          Screenshot
        </button>
      </div>
      <div className="flex-grow overflow-y-auto mb-3 pr-1 custom-scrollbar space-y-3">
        {chatMessages.length === 0 && !isChatLoading && !chatError && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
            <IconChatBubbleLeftRight className="w-10 h-10 mb-2 text-slate-400" />
            <p>Inicia una conversación sobre los documentos.</p>
            <p>Pregunta lo que necesites saber.</p>
          </div>
        )}
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-2.5 rounded-xl shadow ${
                msg.role === 'user'
                  ? 'bg-primary-500 text-white rounded-br-none'
                  : 'bg-white text-slate-800 rounded-bl-none'
              } ${msg.isLoading ? 'opacity-70' : ''}`}
            >
              {msg.isLoading && msg.role === 'model' ? (
                <div className="flex items-center space-x-1.5">
                    <LoadingSpinner mini={true} /> 
                    <span className="text-xs italic">Pensando...</span>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
              )}
              {msg.error && msg.role === 'model' && (
                 <p className="text-xs text-red-500 mt-1 pt-1 border-t border-red-300/50">Error: {msg.error}</p>
              )}
              <div className="text-xs mt-1 opacity-70 text-right">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {chatError && !chatMessages.some(m => m.isLoading) && ( // General chat error not tied to a message
        <div className="mb-2 p-2 bg-red-100 text-red-800 text-xs rounded flex items-center space-x-2">
          <IconAlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Error en el chat: {chatError}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-3">
        {suggestedQuestions.map((question, index) => (
          <button
            key={index}
            onClick={() => handleChipClick(question)}
            disabled={isChatLoading}
            className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700 rounded-full px-3 py-1 cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-800/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {question}
          </button>
        ))}
      </div>
      <div className="flex items-center border-t border-slate-300 pt-3">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isChatLoading ? "Esperando respuesta..." : "Escribe tu pregunta..."}
          className="flex-grow bg-white border border-slate-300 text-slate-900 rounded-l-md p-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
          disabled={isChatLoading}
          aria-label="Escribe tu pregunta para el chat"
        />
        <button
          onClick={() => handleSend()}
          disabled={isChatLoading || !inputText.trim()}
          className="bg-primary-500 hover:bg-primary-600 text-white font-semibold p-2.5 rounded-r-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          aria-label="Enviar mensaje al chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M3.105 3.105a.5.5 0 01.707-.707l11.586 11.586a.5.5 0 01-.707.707L3.105 3.105zM3.105 16.895a.5.5 0 01.707.707l11.586-11.586a.5.5 0 01-.707-.707L3.105 16.895z" /> {/* Simple send icon, replace if you have a dedicated one */}
             <path d="M3.504 3.375C2.193 4.014 1.5 5.395 1.5 6.932V13.07c0 1.537.693 2.918 2.004 3.556L16.62 12.12A3.001 3.001 0 0016.62 7.88zM3 6.932V13.07a4.5 4.5 0 003.006 4.234l11.116-4.764a1.5 1.5 0 000-2.98L6.006 2.698A4.5 4.5 0 003 6.932z"/> {/* Send icon shape */}
          </svg>
        </button>
      </div>
    </div>
  );
};
