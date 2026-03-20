
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { IconAlertTriangle, IconChatBubbleLeftRight } from './IconComponents'; // Added IconChatBubbleLeftRight

interface DocumentChatProps {
  documentId: string;
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  chatError?: string | null;
  onSendMessage: (messageText: string) => void;
}

export const DocumentChat: React.FC<DocumentChatProps> = ({
  chatMessages,
  isChatLoading,
  chatError,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatMessages]);

  const handleSend = () => {
    if (inputText.trim() && !isChatLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="mt-2 p-3 bg-slate-100/70 rounded-lg shadow-inner flex flex-col h-[400px] max-h-[60vh]">
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
          onClick={handleSend}
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