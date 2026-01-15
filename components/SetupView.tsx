import React, { useState, useRef, useEffect } from 'react';
import { QuizConfig, QuizMode, SessionBackup, ExamResult } from '../types';
import { LucideSettings, LucidePlay, LucideRotateCcw, LucideFileText, LucideCamera, LucideLoader2, LucideImagePlus, LucideShuffle, LucideX, LucideSend, LucideTrash2, LucideKey, LucideEye, LucideEyeOff, LucideExternalLink, LucideSparkles, LucideUser, LucideSave, LucideFolderOpen, LucideDatabase, LucideWand2, LucideArrowUp } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface SetupViewProps {
  rawInput: string;
  setRawInput: (val: string) => void;
  config: QuizConfig;
  setConfig: (val: QuizConfig) => void;
  stats: { total: number; taken: number | string; remaining: number | string };
  history: ExamResult[];
  progress: { nextSerialIndex: number; usedRandomIndices: number[] };
  onLoadSession: (data: SessionBackup) => void;
  onStart: () => void;
  onReset: () => void;
  apiKey: string;
  onSetApiKey: (key: string) => void;
  onRemoveApiKey: () => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  rawInput,
  setRawInput,
  config,
  setConfig,
  stats,
  history,
  progress,
  onLoadSession,
  onStart,
  onReset,
  apiKey,
  onSetApiKey,
  onRemoveApiKey
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [showAiInterface, setShowAiInterface] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [forceRecentStructure, setForceRecentStructure] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);

  // Key Modal local state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState(apiKey);
  const [showKeyText, setShowKeyText] = useState(false);

  useEffect(() => {
    if (selectedFiles.length > 0) {
      setForceRecentStructure(true);
    }
  }, [selectedFiles.length]);

  const handleSaveKey = async () => {
    const trimmedKey = tempKeyInput.trim();
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
      setShowKeyModal(false);
    } catch (err) {
      console.error("API Key validation failed:", err);
      alert("দুঃখিত, এই API Key-টি সঠিক নয়। দয়া করে একটি সচল Key ব্যবহার করুন।");
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveKeyAction = () => {
    onRemoveApiKey();
    setTempKeyInput("");
  };

  const handleChange = (field: keyof QuizConfig, value: string | number | boolean) => {
    const newConfig = { ...config, [field]: value };
    if (field === 'questionLimit') {
      const numValue = Number(value);
      if (value !== '' && !isNaN(numValue)) {
        newConfig.timeMinutes = Math.max(1, Math.round(numValue * 0.6));
      }
    }
    setConfig(newConfig);
  };

  const handleExportSession = () => {
    if (!rawInput.trim() && history.length === 0) {
      alert("ব্যাকআপ করার মতো কোনো ডাটা নেই।");
      return;
    }
    const backup: SessionBackup = {
      version: 1,
      timestamp: Date.now(),
      rawInput,
      config,
      progress: progress,
      history: history
    };
    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quiz_session_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.version && (json.rawInput !== undefined || json.history)) {
           onLoadSession(json as SessionBackup);
        } else {
           alert("ভুল ফরম্যাটের সেশন ফাইল!");
        }
      } catch (err) {
        alert("ফাইল রিড করতে সমস্যা হয়েছে।");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const openAiGenerator = () => {
    if (!apiKey) {
      setTempKeyInput("");
      setShowKeyModal(true);
      return;
    }
    setShowAiInterface(true);
    setForceRecentStructure(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...filesArray]);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAiGeneratorFields = () => {
    setSelectedFiles([]);
    setCustomPrompt("");
  };

  const handleGenerate = async () => {
    if (selectedFiles.length === 0 && !customPrompt.trim()) {
        alert("অনুগ্রহ করে একটি ছবি যোগ করুন অথবা বিষয় লিখুন।");
        return;
    }
    if (!apiKey) {
        setShowKeyModal(true);
        return;
    }
    setIsGenerating(true);
    try {
      const imageParts = await Promise.all(
        selectedFiles.map(async (file) => {
          return new Promise<{ inlineData: { mimeType: string; data: string } }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64String = e.target?.result as string;
              const base64Data = base64String.split(',')[1];
              resolve({
                inlineData: { mimeType: file.type, data: base64Data }
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );
      const userInstruction = customPrompt.trim();
      const fullPrompt = `
      TASK: Generate Multiple Choice Questions (MCQs) in Bengali based on the provided content.
      USER PROMPT: ${userInstruction ? userInstruction : "Analyze the images and generate questions."}
      
      STRICT FORMAT RULES (MUST FOLLOW):
      1. Each question must be on a single line.
      2. Format: Question Text | Option A | Option B | Option C | Option D | CorrectKey ###
      3. The "CorrectKey" MUST be exactly: ক, খ, গ, or ঘ.
      4. Separate each question block with ###.
      5. Do not add numbering (1., 2.) at the start of the line.
      6. Do not include intro/outro text.
      `;
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const contentParts: any[] = [...imageParts, { text: fullPrompt }];
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: contentParts }
      });
      if (response.text) {
        setRawInput(prev => (prev.trim() ? prev + '\n' : '') + response.text.trim());
        setShowAiInterface(false);
      }
    } catch (err) {
      console.error("Gemini API Error:", err);
      alert("AI জেনারেশন ব্যর্থ হয়েছে। API Key চেক করুন।");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInputInteraction = () => {
    if (selectedFiles.length === 0) {
      setForceRecentStructure(false);
    }
  };

  const hasAiInput = selectedFiles.length > 0 || customPrompt.trim() !== "";
  const isShowingRecentStructure = forceRecentStructure || selectedFiles.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-lg p-5 mb-6 border border-gray-200 text-gray-800 relative">
      {showKeyModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="w-full max-w-sm bg-white border border-gray-200 shadow-2xl rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <LucideKey size={18} className="text-amber-500"/>
                      Google Gemini সেটআপ
                  </h3>
                  <button onClick={() => setShowKeyModal(false)} className="text-gray-400 hover:text-red-500">
                      <LucideX size={18} />
                  </button>
              </div>
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">AI ফিচার ব্যবহার করার জন্য আপনার নিজস্ব Google Gemini API Key প্রয়োজন।</p>
              <div className="relative mb-3">
                  <input 
                      type={showKeyText ? "text" : "password"}
                      value={tempKeyInput}
                      onChange={(e) => setTempKeyInput(e.target.value)}
                      placeholder="API Key এখানে পেস্ট করুন"
                      className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-gray-900"
                      disabled={isValidating}
                  />
                  <button onClick={() => setShowKeyText(!showKeyText)} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                      {showKeyText ? <LucideEyeOff size={16}/> : <LucideEye size={16}/>}
                  </button>
              </div>
              <div className="flex gap-2 mb-4">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1 hover:underline font-medium">
                      Key কোথায় পাবো? <LucideExternalLink size={10} />
                  </a>
              </div>
              <div className="flex gap-2">
                  <button 
                    onClick={handleSaveKey} 
                    disabled={!tempKeyInput || isValidating} 
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isValidating && <LucideLoader2 size={16} className="animate-spin" />}
                    সেভ করুন
                  </button>
                  {apiKey && (
                    <button 
                      onClick={handleRemoveKeyAction} 
                      className="px-3 bg-red-100 text-red-600 rounded-lg font-bold text-sm hover:bg-red-200"
                    >
                      মুছে ফেলুন
                    </button>
                  )}
              </div>
           </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><LucideFileText size={20} /></div>
            <h2 className="text-lg font-bold text-blue-600">প্রশ্ন ব্যাংক সেটআপ</h2>
        </div>
        <button onClick={() => { setTempKeyInput(apiKey); setShowKeyModal(true); }} className={`relative w-10 h-10 rounded-full flex items-center justify-center shadow-sm border ${apiKey ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-transparent' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
            {apiKey ? <LucideSparkles size={18} /> : <LucideUser size={20} />}
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${apiKey ? 'bg-green-500' : 'bg-red-400'}`}></span>
        </button>
      </div>
      <div className="mb-5">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />
        {showAiInterface ? (
           <div className="w-full h-[180px] bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden relative">
              <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                  {hasAiInput && (
                    <button 
                      onClick={clearAiGeneratorFields} 
                      className="p-1.5 bg-white/50 text-gray-400 hover:text-red-500 rounded-full hover:bg-white shadow-sm border border-gray-100"
                      title="মুছে ফেলুন"
                    >
                      <LucideTrash2 size={14} />
                    </button>
                  )}
                  <button 
                    onClick={() => setShowAiInterface(false)} 
                    className="p-1.5 bg-white/50 text-gray-400 hover:text-red-500 rounded-full hover:bg-white shadow-sm border border-gray-100"
                    title="বন্ধ করুন"
                  >
                    <LucideX size={14} />
                  </button>
              </div>
              <div className="p-3 flex flex-col h-full">
                <h3 className="shrink-0 text-sm font-bold text-slate-700 flex items-center gap-2 px-1 mb-2"><LucideSparkles size={16} className="text-indigo-500" /> AI প্রশ্ন জেনারেটর</h3>
                
                {!isShowingRecentStructure ? (
                  <div className="flex-1 flex gap-3 px-1 pb-1">
                    <div className="flex-1 border border-gray-300 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col">
                        <textarea 
                            className="w-full flex-1 p-3 text-sm focus:outline-none bg-white text-gray-900 resize-none leading-relaxed" 
                            placeholder="বিষয় লিখুন (যেমন: বাংলাদেশের নদী)..." 
                            value={customPrompt} 
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            disabled={isGenerating}
                        />
                    </div>
                    <div className="flex flex-col gap-2 justify-end">
                        <button 
                            onClick={() => fileInputRef.current?.click()} 
                            className="w-12 h-12 border-2 border-dashed border-slate-300 text-slate-400 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shadow-sm active:scale-95 bg-white"
                            title="ছবি যোগ করুন"
                        >
                            <LucideImagePlus size={24} />
                        </button>
                        <button 
                            onClick={handleGenerate} 
                            disabled={isGenerating || (selectedFiles.length === 0 && !customPrompt.trim())} 
                            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm active:scale-95 ${
                              isGenerating 
                                ? 'bg-slate-200 text-slate-400' 
                                : (selectedFiles.length > 0 || customPrompt.trim() !== "")
                                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                            }`}
                        >
                            {isGenerating ? <LucideLoader2 size={20} className="animate-spin" /> : <LucideArrowUp size={24} />}
                        </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 flex items-center gap-3 overflow-x-auto py-1 px-1">
                        <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 flex-shrink-0 bg-white border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500"><LucideImagePlus size={30} /></button>
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} className="relative w-20 h-20 flex-shrink-0 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
                             <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover rounded-lg" />
                             <button onClick={() => removeFile(idx)} className="absolute -top-2 -right-2 bg-white text-red-500 border border-red-100 p-1 rounded-full shadow-md hover:bg-red-50"><LucideX size={12} /></button>
                          </div>
                        ))}
                    </div>
                    <div className="shrink-0 flex gap-2 mt-2">
                        <input 
                            type="text" 
                            className="flex-1 h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 bg-white text-gray-900" 
                            placeholder="বিষয় লিখুন..." 
                            value={customPrompt} 
                            onChange={(e) => setCustomPrompt(e.target.value)} 
                            onFocus={handleInputInteraction}
                            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} 
                            disabled={isGenerating} 
                        />
                        <button onClick={handleGenerate} disabled={isGenerating || (selectedFiles.length === 0 && !customPrompt.trim())} className={`h-11 w-12 rounded-lg flex items-center justify-center ${
                          isGenerating 
                            ? 'bg-slate-200 text-slate-400' 
                            : (selectedFiles.length > 0 || customPrompt.trim() !== "")
                              ? 'bg-blue-600 text-white hover:bg-blue-700' 
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        }`}>
                            {isGenerating ? <LucideLoader2 size={20} className="animate-spin" /> : <LucideArrowUp size={24} />}
                        </button>
                    </div>
                  </>
                )}
              </div>
           </div>
        ) : (
           <div className="w-full h-[180px] flex flex-col">
              <div className="shrink-0 flex justify-between items-end mb-2 gap-2">
                  <label className="block text-sm font-semibold text-gray-700 leading-tight">প্রশ্ন ব্যাংক <span className="text-gray-400 font-normal text-xs block sm:inline">(ফরম্যাট: প্রশ্ন | ক | খ | গ | ঘ | সঠিক ###)</span></label>
                  <button onClick={openAiGenerator} className="flex items-center gap-2 px-4 py-2 rounded-md font-bold text-white bg-indigo-500 hover:bg-indigo-600 text-xs whitespace-nowrap"><LucideWand2 size={14} /> AI জেনারেটর</button>
              </div>
              <div className="flex-1 relative">
                <textarea 
                  className="w-full h-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono bg-gray-50 resize-none text-gray-900" 
                  placeholder={"সঠিক ফরম্যাটে প্রশ্ন লিখুন বা পেস্ট করুন...\n\nউদাহরণ:\nজাপানের মুদ্রা? | ইয়েন | রিয়াল | ডলার | টাকা | ক ###\nবাংলাদেশের রাজধানী? | ঢাকা | খুলনা | রাজশাহী | বরিশাল | ক ###"}
                  value={rawInput} 
                  onChange={(e) => setRawInput(e.target.value)} 
                />
                {rawInput.length > 0 && <button onClick={() => setRawInput('')} className="absolute top-2 right-2 p-1.5 bg-white text-gray-400 hover:text-red-500 rounded-md shadow-sm border border-gray-200"><LucideTrash2 size={14} /></button>}
              </div>
           </div>
        )}
      </div>
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-5 text-gray-900">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div><label className="block text-xs font-bold text-gray-500 mb-1">সময় (মিনিট)</label><input type="number" min="1" className="w-full h-10 px-2 border border-gray-300 rounded-md text-center font-bold bg-white text-gray-900" value={config.timeMinutes} onChange={(e) => handleChange('timeMinutes', e.target.value === '' ? '' : parseInt(e.target.value))} /></div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">লিমিট (প্রশ্ন)</label><input type="number" min="1" className="w-full h-10 px-2 border border-gray-300 rounded-md text-center font-bold bg-white text-gray-900" value={config.questionLimit} onChange={(e) => handleChange('questionLimit', e.target.value === '' ? '' : parseInt(e.target.value))} /></div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">অপশন শাফল</label><button type="button" onClick={() => handleChange('shuffleOptions', !config.shuffleOptions)} className={`w-full h-10 px-2 rounded-md border flex items-center justify-center gap-2 font-bold ${config.shuffleOptions ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 border-gray-300'}`}><LucideShuffle size={16} /><span className="text-xs">{config.shuffleOptions ? 'চালু' : 'বন্ধ'}</span></button></div>
        </div>
        <div><label className="block text-xs font-bold text-gray-500 mb-1">মোড (প্রশ্নের ক্রোম)</label><div className="relative"><select className="w-full h-10 px-2 border border-gray-300 rounded-md bg-white text-sm text-gray-900" value={config.mode} onChange={(e) => handleChange('mode', e.target.value as QuizMode)}><option value={QuizMode.SERIAL}>সিরিয়াল (Serial)</option><option value={QuizMode.RANDOM_LIMITED}>র‍্যান্ডম লিমিটেড</option><option value={QuizMode.RANDOM_UNLIMITED}>র‍্যান্ডম আনলিমিটেড</option></select></div></div>
      </div>
      <div className="flex items-center justify-between bg-blue-50 text-blue-800 py-1.5 px-3 rounded-lg mb-4 border border-blue-100 text-xs">
        <div className="flex items-center gap-2"><LucideDatabase size={14} /><span className="font-bold">প্রশ্ন স্ট্যাটাস:</span></div>
        <div className="font-bold space-x-3"><span>মোট: {stats.total}</span><span>হয়েছে: {stats.taken}</span><span>বাকি: {stats.remaining}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <input type="file" ref={sessionInputRef} onChange={handleImportSession} accept=".json" className="hidden" />
        <button onClick={() => sessionInputRef.current?.click()} className="flex items-center justify-center gap-2 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-bold"><LucideFolderOpen size={14} /> লোড সেশন</button>
        <button onClick={handleExportSession} className="flex items-center justify-center gap-2 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-bold"><LucideSave size={14} /> সেভ সেশন</button>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <button onClick={onStart} className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-sm text-sm"><LucidePlay size={18} /> পরীক্ষা শুরু করুন</button>
        <button onClick={onReset} className="flex items-center justify-center gap-2 w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold"><LucideRotateCcw size={16} /> সব রিসেট করুন</button>
      </div>
    </div>
  );
};