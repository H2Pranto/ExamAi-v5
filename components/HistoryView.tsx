import React, { useRef } from 'react';
import { ExamResult } from '../types';
import { LucideHistory, LucideChevronRight, LucideAward, LucideDownload, LucideUpload } from 'lucide-react';

interface HistoryViewProps {
  history: ExamResult[];
  examLabelMap: Map<number, string>;
  onReview: (result: ExamResult) => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ 
  history, 
  examLabelMap,
  onReview, 
  onExport,
  onImport
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (history.length === 0) {
    return (
      <div className="mt-8 border-t-2 border-gray-200 pt-6">
         <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                <LucideHistory size={20} />
                পরীক্ষার ইতিহাস
            </h3>
            
            <div className="flex gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={onImport}
                  accept=".json"
                  className="hidden"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 text-xs font-bold shadow-sm transition-colors"
                >
                  <LucideUpload size={14} /> ইমপোর্ট
                </button>
            </div>
         </div>
         <div className="p-6 text-center text-gray-400 bg-white rounded-lg border border-dashed border-gray-300 shadow-sm">
            কোনো ইতিহাস নেই।
        </div>
      </div>
    );
  }

  const displayHistory = [...history].reverse();

  return (
    <div className="mt-8 border-t-2 border-gray-200 pt-6">
      <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
            <LucideHistory size={20} />
            পরীক্ষার ইতিহাস
          </h3>
          
          <div className="flex gap-2">
            <button 
                onClick={onExport}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 text-xs font-bold shadow-sm transition-colors"
                title="ইতিহাস ডাউনলোড করুন"
            >
                <LucideDownload size={14} /> এক্সপোর্ট
            </button>
            
            <input 
                type="file" 
                ref={fileInputRef}
                onChange={onImport}
                accept=".json"
                className="hidden"
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 text-xs font-bold shadow-sm transition-colors"
                title="ইতিহাস আপলোড করুন"
            >
                <LucideUpload size={14} /> ইমপোর্ট
            </button>
          </div>
      </div>
      
      <div className="space-y-3">
        {displayHistory.map((res) => {
          // Individual marking calculation for each history item
          const negMark = res.negativeMark || 0.25;
          const score = (res.stats.correct * 1) - (res.stats.wrong * negMark);
          return (
            <div
              key={res.id}
              onClick={() => onReview(res)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-all text-gray-800 shadow-sm group cursor-pointer"
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 flex items-center gap-2">
                    <LucideAward size={16} className="text-amber-500" />
                    Exam {examLabelMap.get(res.id) || '?'}
                  </span>
                  <span className="text-[10px] text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200 shadow-sm">
                    Score: {score.toFixed(2)} (Neg: -{negMark})
                  </span>
                </div>
                <span className="text-xs text-gray-800 font-black bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                  {new Date(res.timestamp).toLocaleDateString()} {new Date(res.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-sm border-t border-dashed border-gray-200 pt-2 mt-2">
                <div className="flex gap-3 text-xs sm:text-sm">
                  <span className="text-green-600 font-bold">সঠিক: {res.stats.correct}</span>
                  <span className="text-red-600 font-bold">ভুল: {res.stats.wrong}</span>
                  <span className="text-amber-600 font-bold">বাকি: {res.stats.skipped}</span>
                </div>
                
                <div className="flex gap-2">
                    <button 
                      className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 rounded-md text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 shadow-sm"
                    >
                      রিভিউ <LucideChevronRight size={12} />
                    </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};