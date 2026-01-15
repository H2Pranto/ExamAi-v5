import React, { useEffect, useState, useRef } from 'react';
import { ExamResult } from '../types';
import { 
  LucideX, LucideCheck, LucideXCircle, LucideSparkles, LucideLoader2, 
  LucideSettings2, LucideCalculator, LucideArrowLeft, LucideRefreshCw, LucideBot,
  LucideKey, LucideExternalLink, LucideEye, LucideEyeOff, LucideSend, LucideMessageSquare,
  LucideBookOpen
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface ReviewModalProps {
  result: ExamResult | null;
  onClose: () => void;
  apiKey: string;
  onSetApiKey: (key: string) => void;
  onRemoveApiKey: () => void;
  onRetake: () => void;
  onUpdateResult: (updated: ExamResult) => void;
  examNumber?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isInitial?: boolean;
}

type ChatCache = Record<string, ChatMessage[]>;

const FormatText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </span>
  );
};

export const ReviewModal: React.FC<ReviewModalProps> = ({ 
  result, 
  onClose, 
  apiKey, 
  onSetApiKey, 
  onRemoveApiKey,
  onRetake, 
  onUpdateResult,
  examNumber 
}) => {
  const [showDual, setShowDual] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [view, setView] = useState<'LIST' | 'CHAT'>('LIST');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'CORRECT' | 'WRONG' | 'SKIPPED'>('ALL');
  
  const [chatHistories, setChatHistories] = useState<ChatCache>({});
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listScrollPos = useRef(0);

  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [showKeyText, setShowKeyText] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'CHAT'; index: number } | null>(null);

  // Reset filter and view state whenever result changes or modal opens/closes
  useEffect(() => {
    setFilterMode('ALL');
    setView('LIST');
    setActiveIndex(null);
    setInputText("");
    // We don't clear chatHistories to allow users to revisit chats during the same session
  }, [result?.id]);

  useEffect(() => {
    if (result) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [result]);

  useEffect(() => {
    if (showKeyInput) {
      setTempKey(apiKey);
    }
  }, [showKeyInput, apiKey]);

  useEffect(() => {
    if (view === 'CHAT' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    // Restore scroll position when coming back to list
    if (view === 'LIST' && listContainerRef.current) {
      listContainerRef.current.scrollTop = listScrollPos.current;
    }
  }, [chatHistories, view, activeIndex, isGenerating]);

  useEffect(() => {
    if (apiKey && pendingAction) {
        if (pendingAction.type === 'CHAT') {
            handleTriggerAI(pendingAction.index);
        }
        setPendingAction(null);
    }
  }, [apiKey, pendingAction]);

  if (!result) return null;

  const currentNegMark = result.negativeMark || 0.25;

  const calculateScore = (neg: number) => {
    const raw = (result.stats.correct * 1) - (result.stats.wrong * neg);
    return parseFloat(raw.toFixed(2));
  };

  const currentScore = calculateScore(currentNegMark);
  const altNeg = currentNegMark === 0.25 ? 0.50 : 0.25;
  const altScore = calculateScore(altNeg);

  const getCacheKey = (index: number) => `${result.id}-${index}`;

  const getSystemPrompt = (qIndex: number) => {
    const q = result.questions[qIndex];
    const userAns = result.userChoices[qIndex];
    const userAnsText = userAns ? q.opt[userAns] : 'Skipped';
    const correctAnsText = q.opt[q.a];

    return `
      Context:
      - Question: "${q.q}"
      - Options: ${JSON.stringify(q.opt)}
      - Correct Answer: "${q.a}" (${correctAnsText})
      - User Answer: "${userAns || 'None'}" (${userAnsText})
      
      Role: Expert Subject Matter Teacher (Bengali).
      
      Instructions for INITIAL EXPLANATION:
      1. Format: Use clear paragraphs. BOLD (**text**) key concepts.
      2. Core Task: Explain WHY the correct answer is right.
      3. Comparative Analysis: Explicitly mention the User's Answer ("${userAnsText}") and explain why it is incorrect or what it refers to.
      4. Language: Bengali.
    `;
  };

  const initChat = async (index: number, forceReset = false) => {
    const cacheKey = getCacheKey(index);
    if (!forceReset && chatHistories[cacheKey] && chatHistories[cacheKey].length > 0) return;
    if (!apiKey) {
      setShowKeyInput(true);
      return;
    }

    setIsGenerating(true);
    setChatHistories(prev => ({ ...prev, [cacheKey]: [] }));

    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemPrompt = getSystemPrompt(index);
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: systemPrompt + "\n\nProvide the main detailed explanation now." }] }
      });

      const text = response.text?.trim() || "দুঃখিত, ব্যাখ্যা তৈরি করা সম্ভব হয়নি।";
      
      setChatHistories(prev => ({
        ...prev,
        [cacheKey]: [{ role: 'model', text, isInitial: true }]
      }));
      
    } catch (error) {
      console.error(error);
      alert("AI সংযোগ বিচ্ছিন্ন। API Key চেক করুন বা আবার চেষ্টা করুন।");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || activeIndex === null) return;
    
    const currentIndex = activeIndex;
    const cacheKey = getCacheKey(currentIndex);
    const currentHistory = chatHistories[cacheKey] || [];
    const userMsg = inputText.trim();
    
    setInputText("");
    setChatHistories(prev => ({
      ...prev,
      [cacheKey]: [...currentHistory, { role: 'user', text: userMsg }]
    }));
    setIsGenerating(true);

    if (!apiKey) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemPrompt = getSystemPrompt(currentIndex);

      const contents = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        ...currentHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        { role: 'user', parts: [{ text: userMsg }] }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents
      });

      const aiText = response.text?.trim() || "দুঃখিত, উত্তর দেওয়া সম্ভব হয়নি।";

      setChatHistories(prev => ({
        ...prev,
        [cacheKey]: [...prev[cacheKey], { role: 'model', text: aiText }]
      }));

    } catch (error) {
      console.error(error);
      setChatHistories(prev => ({
        ...prev,
        [cacheKey]: [...prev[cacheKey], { role: 'model', text: "নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।" }]
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScoreBoxClick = () => {
    setShowSettings(!showSettings);
  };

  const handleUpdateMark = (val: 0.25 | 0.50) => {
    onUpdateResult({ ...result, negativeMark: val });
  };

  const handleTriggerAI = (index: number) => {
    if (listContainerRef.current) {
        listScrollPos.current = listContainerRef.current.scrollTop;
    }
    if (!apiKey) {
      setPendingAction({ type: 'CHAT', index });
      setShowKeyInput(true);
    } else {
      setActiveIndex(index);
      setView('CHAT');
      initChat(index);
    }
  };

  const handleBackToList = () => {
    setView('LIST');
    setActiveIndex(null);
  };

  const handleSaveKey = async () => {
    const trimmedKey = tempKey.trim();
    if (!trimmedKey) return;

    setIsValidating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: trimmedKey });
      await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: 'key validation' }] }],
        config: { maxOutputTokens: 1 }
      });
      
      onSetApiKey(trimmedKey);
      setShowKeyInput(false);
    } catch (err) {
      console.error("API Key validation failed:", err);
      alert("দুঃখিত, এই API Key-টি সঠিক নয়। দয়া করে একটি সচল Key ব্যবহার করুন।");
    } finally {
      setIsValidating(false);
    }
  };

  const handleCloseKeyModal = () => {
    setShowKeyInput(false);
    setPendingAction(null);
  };

  const toggleFilter = (mode: 'CORRECT' | 'WRONG' | 'SKIPPED') => {
    setFilterMode(prev => prev === mode ? 'ALL' : mode);
  };

  const renderListView = () => {
    const filteredQuestions = result.questions.filter((q, idx) => {
        if (filterMode === 'ALL') return true;
        const userAns = result.userChoices[idx];
        if (filterMode === 'CORRECT') return userAns === q.a;
        if (filterMode === 'WRONG') return userAns !== null && userAns !== q.a;
        if (filterMode === 'SKIPPED') return userAns === null;
        return true;
    });

    return (
        <>
        <div className="bg-white border-b border-gray-100 shrink-0">
            <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex flex-col">
                    <h2 className="text-base font-extrabold text-gray-900 leading-tight">ফলাফল (Exam {examNumber || `#${result.id}`})</h2>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                        {new Date(result.timestamp).toLocaleDateString('en-GB')} {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
                
                <div className="relative z-20 flex-1 flex justify-center px-2">
                    <div 
                        onClick={handleScoreBoxClick}
                        className="w-full max-w-[180px] bg-[#f8f9fb] border border-gray-200 rounded-xl px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-gray-100 shadow-sm active:scale-[0.98] group"
                    >
                        <div className="flex flex-col">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-0.5">Score</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-slate-800 tabular-nums leading-none">{currentScore}</span>
                                {showDual && <span className="text-xs text-slate-400 font-bold leading-none">/ {altScore}</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-px bg-gray-200"></div>
                            <div className="flex flex-col items-center">
                            <LucideSettings2 size={16} className="text-gray-400 group-hover:text-slate-600" />
                            <span className="text-[7px] font-bold text-gray-400 mt-0.5">-{currentNegMark}</span>
                            </div>
                        </div>
                    </div>

                    {showSettings && (
                        <div className="absolute top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-4 origin-top w-56">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs font-bold text-gray-500 uppercase">নেগেটিভ মার্কিং</span>
                                <button onClick={(e) => { e.stopPropagation(); setShowSettings(false); }} className="text-gray-400 hover:text-red-500">
                                    <LucideX size={14} />
                                </button>
                            </div>
                            
                            <div className="flex gap-2 mb-4">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleUpdateMark(0.25); }}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg border ${currentNegMark === 0.25 ? 'bg-slate-100 border-slate-500 text-slate-700 ring-1 ring-slate-500' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                >
                                    0.25
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleUpdateMark(0.50); }}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg border ${currentNegMark === 0.50 ? 'bg-slate-100 border-slate-500 text-slate-700 ring-1 ring-slate-500' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                >
                                    0.50
                                </button>
                            </div>
                            
                            <label 
                                onClick={(e) => { e.stopPropagation(); setShowDual(!showDual); }}
                                className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-200"
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${showDual ? 'bg-slate-600 border-slate-600' : 'bg-white border-gray-300'}`}>
                                    {showDual && <LucideCheck size={10} className="text-white" />}
                                </div>
                                <span className="text-sm font-medium text-gray-700">দুটি স্কোর দেখুন</span>
                            </label>
                        </div>
                    )}
                </div>

                <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full shrink-0">
                    <LucideX size={20} className="text-gray-500" />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                <button 
                    onClick={() => toggleFilter('CORRECT')}
                    className={`text-green-800 py-1.5 px-2 rounded-lg text-center border transition-all flex flex-col items-center justify-center active:scale-95 ${
                        filterMode === 'CORRECT' ? 'bg-green-200 border-green-500 ring-2 ring-green-500/20' : 'bg-green-100 border-green-200 hover:bg-green-200'
                    }`}
                >
                    <div className="text-[9px] font-bold opacity-70 uppercase tracking-wide">সঠিক</div>
                    <div className="text-base font-extrabold leading-none">{result.stats.correct}</div>
                </button>
                <button 
                    onClick={() => toggleFilter('WRONG')}
                    className={`text-red-800 py-1.5 px-2 rounded-lg text-center border transition-all flex flex-col items-center justify-center active:scale-95 ${
                        filterMode === 'WRONG' ? 'bg-red-200 border-red-500 ring-2 ring-red-500/20' : 'bg-red-100 border-red-200 hover:bg-red-200'
                    }`}
                >
                    <div className="text-[9px] font-bold opacity-70 uppercase tracking-wide">ভুল</div>
                    <div className="text-base font-extrabold leading-none">{result.stats.wrong}</div>
                </button>
                <button 
                    onClick={() => toggleFilter('SKIPPED')}
                    className={`text-amber-800 py-1.5 px-2 rounded-lg text-center border transition-all flex flex-col items-center justify-center active:scale-95 ${
                        filterMode === 'SKIPPED' ? 'bg-amber-200 border-amber-500 ring-2 ring-amber-500/20' : 'bg-amber-100 border-amber-200 hover:bg-amber-200'
                    }`}
                >
                    <div className="text-[9px] font-bold opacity-70 uppercase tracking-wide">বাকি</div>
                    <div className="text-base font-extrabold leading-none">{result.stats.skipped}</div>
                </button>
            </div>
        </div>

        <div ref={listContainerRef} className="overflow-y-auto p-3 space-y-3 bg-white flex-1">
            {filteredQuestions.length === 0 && (
                <div className="py-20 text-center text-gray-400 italic">
                    এই ক্যাটাগরিতে কোনো প্রশ্ন নেই।
                </div>
            )}
            {result.questions.map((q, idx) => {
            const userAns = result.userChoices[idx];
            const isSkipped = userAns === null;
            const isCorrectAnswer = userAns === q.a;
            
            // Check if this question matches the current filter
            if (filterMode === 'CORRECT' && !isCorrectAnswer) return null;
            if (filterMode === 'WRONG' && (isSkipped || isCorrectAnswer)) return null;
            if (filterMode === 'SKIPPED' && !isSkipped) return null;

            let cardStyles = "bg-white border-gray-200";
            if (!isSkipped) {
                cardStyles = isCorrectAnswer ? "bg-white border-green-500 ring-1 ring-green-500/20" : "bg-white border-red-300 ring-1 ring-red-300/20";
            } else {
                cardStyles = "bg-amber-50/50 border-amber-300"; // 50% lighter than amber-100ish
            }

            return (
                <div key={idx} className={`p-3 rounded-xl shadow-sm border ${cardStyles} relative overflow-hidden text-gray-900 transition-colors`}>
                <div className="flex justify-between items-start gap-2 mb-2.5">
                    <div className="font-bold text-gray-800 flex gap-2 text-sm leading-relaxed flex-1">
                        <span className="text-gray-400 text-xs mt-1 min-w-[20px]">{idx + 1}.</span> 
                        <span className="py-0.5">{q.q}</span>
                    </div>
                    
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            handleTriggerAI(idx);
                        }}
                        className="shrink-0 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-200 flex items-center gap-1 active:scale-95 shadow-sm"
                    >
                        <LucideSparkles size={12} className="text-amber-500" />
                        AI ব্যাখ্যা
                    </button>
                </div>
                
                <div className="space-y-1.5">
                    {Object.entries(q.opt).map(([key, val]) => {
                    const isCorrectOpt = key === q.a;
                    const isUserSelected = key === userAns;
                    
                    let styles = isSkipped ? "bg-amber-50/70 border-amber-200 text-amber-900" : "bg-white border-gray-200 text-gray-600";
                    let icon = null;

                    if (isCorrectOpt) {
                        styles = isUserSelected 
                        ? "bg-green-100 border-green-600 text-green-900 font-bold shadow-sm" 
                        : "bg-green-50 border-green-500 text-green-800 font-bold";
                        icon = <LucideCheck size={18} className={isUserSelected ? "text-green-800 stroke-[3]" : "text-green-600 stroke-[3]"} />;
                    } else if (isUserSelected) {
                        styles = "bg-red-50 border-red-500 text-red-800 font-bold";
                        icon = <LucideXCircle size={16} className="text-red-600 stroke-[2.5]" />;
                    }

                    return (
                        <div key={key} className={`flex items-center justify-between p-2 px-3 rounded-lg border text-xs ${styles} ${isCorrectOpt || isUserSelected ? 'border-2' : ''}`}>
                        <span className="flex items-center gap-2">
                            <span className={`font-bold w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${
                                (isCorrectOpt || isUserSelected) ? 'border-current opacity-100' : 'border-gray-300 opacity-70'
                            }`}>
                            {key}
                            </span> 
                            <span className="leading-relaxed py-0.5">{val}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                            {isUserSelected && <span className="text-[9px] uppercase tracking-wide opacity-100 font-extrabold hidden sm:inline">(আপনার উত্তর)</span>}
                            {icon}
                        </div>
                        </div>
                    );
                    })}
                </div>
                </div>
            );
            })}
        </div>
        
        <div className="p-2 border-t border-gray-200 bg-gray-50 flex gap-2">
            <button 
                onClick={onClose} 
                className="flex-1 py-2 bg-white hover:bg-gray-100 text-gray-800 rounded-lg font-bold border border-gray-300 text-sm shadow-sm"
            >
                বন্ধ করুন
            </button>
            
            <button 
                onClick={onRetake}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold border border-indigo-800 text-sm shadow-sm flex items-center justify-center gap-2"
            >
                <LucideRefreshCw size={16} />
                আবার পরীক্ষা দিন
            </button>
        </div>
        </>
    );
  };

  const renderChatView = () => {
    if (activeIndex === null) return null;
    const cacheKey = getCacheKey(activeIndex);
    const history = chatHistories[cacheKey] || [];

    return (
      <div className="flex flex-col h-full bg-slate-50 relative">
        <div className="bg-white border-b border-gray-200 p-3 flex items-center justify-between shrink-0 shadow-sm z-10">
           <div className="flex items-center gap-2">
              <button 
                onClick={handleBackToList}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600"
              >
                <LucideArrowLeft size={20} />
              </button>
              <div>
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <LucideSparkles className="text-amber-500 fill-amber-500" size={14} />
                    AI টিউটর
                  </h2>
                  <div className="text-[10px] text-gray-500 leading-none">প্রশ্ন #{activeIndex + 1} নিয়ে আলোচনা</div>
              </div>
           </div>
           <button 
             onClick={() => initChat(activeIndex, true)} 
             disabled={isGenerating} 
             className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-[10px] font-bold border border-blue-200"
           >
             <LucideRefreshCw size={12} className={isGenerating ? "animate-spin" : ""} />
             অন্য ব্যাখ্যা
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
           {history.length === 0 && isGenerating && (
             <div className="flex justify-center py-10">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <div className="relative">
                        <LucideBot size={32} className="text-blue-500 animate-bounce" />
                        <LucideSparkles size={16} className="text-amber-500 absolute -top-1 -right-1 animate-pulse" />
                    </div>
                    <span className="text-xs font-medium">ব্যাখ্যা তৈরি হচ্ছে...</span>
                </div>
             </div>
           )}

           {history.map((msg, idx) => {
             if (msg.role === 'model' && msg.isInitial) {
               return (
                 <div key={idx}>
                    <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-blue-100 flex items-center gap-2">
                            <LucideBookOpen size={16} className="text-blue-600" />
                            <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">বিষয় বিশ্লেষণ</span>
                        </div>
                        <div className="p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                            <FormatText text={msg.text} />
                        </div>
                    </div>
                 </div>
               );
             }

             return (
               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                  }`}>
                      {msg.role === 'model' && (
                          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                              <LucideBot size={12} />
                              AI
                          </div>
                      )}
                      <div className="whitespace-pre-wrap"><FormatText text={msg.text} /></div>
                  </div>
               </div>
             );
           })}
           
           {history.length > 0 && isGenerating && (
             <div className="flex justify-start">
                <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                   <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                   <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></span>
                   <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></span>
                </div>
             </div>
           )}
           <div ref={chatEndRef} />
        </div>

        <div className="p-3 bg-white border-t border-gray-200 shrink-0">
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <input 
                        type="text" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="আপনার প্রশ্ন লিখুন..."
                        className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm text-gray-900"
                        disabled={isGenerating}
                    />
                    <LucideMessageSquare size={16} className="absolute right-3 top-3.5 text-gray-400" />
                </div>
                <button 
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isGenerating}
                    className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95"
                >
                    <LucideSend size={18} />
                </button>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 relative">
        
        {showKeyInput && (
            <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="w-full max-w-sm bg-white border border-gray-200 shadow-2xl rounded-xl p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <LucideKey size={18} className="text-amber-500"/>
                            Google Gemini সেটআপ
                        </h3>
                        <button onClick={handleCloseKeyModal} className="text-gray-400 hover:text-red-500">
                            <LucideX size={18} />
                        </button>
                    </div>
                    
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                        AI ফিচার ব্যবহার করার জন্য আপনার নিজস্ব Google Gemini API Key প্রয়োজন।
                    </p>

                    <div className="relative mb-3">
                        <input 
                            type={showKeyText ? "text" : "password"}
                            value={tempKey}
                            onChange={(e) => setTempKey(e.target.value)}
                            placeholder="API Key এখানে পেস্ট করুন"
                            className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-gray-900"
                            disabled={isValidating}
                        />
                        <button 
                            onClick={() => setShowKeyText(!showKeyText)}
                            className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                            {showKeyText ? <LucideEyeOff size={16}/> : <LucideEye size={16}/>}
                        </button>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <a 
                            href="https://aistudio.google.com/app/apikey" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 flex items-center gap-1 hover:underline font-medium"
                        >
                            Key কোথায় পাবো? <LucideExternalLink size={10} />
                        </a>
                    </div>

                    <div className="flex gap-2">
                        <button 
                            onClick={handleSaveKey}
                            disabled={!tempKey || isValidating}
                            className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isValidating && <LucideLoader2 size={16} className="animate-spin" />}
                            সেভ করুন
                        </button>
                        {apiKey && (
                          <button 
                            onClick={() => { onRemoveApiKey(); setTempKey(""); }} 
                            className="px-3 bg-red-100 text-red-600 rounded-lg font-bold text-sm hover:bg-red-200"
                          >
                            মুছে ফেলুন
                          </button>
                        )}
                    </div>
                </div>
            </div>
        )}

        {view === 'LIST' ? renderListView() : renderChatView()}
      </div>
    </div>
  );
};