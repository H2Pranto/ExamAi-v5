import { Question } from '../types';

export const parseQuestions = (rawText: string): Question[] => {
  if (!rawText) return [];
  
  const blocks = rawText.split('###').map(b => b.trim()).filter(b => b !== "");
  
  const parsed = blocks.map((block, index): Question | null => {
    // Format: Question | Opt1 | Opt2 | Opt3 | Opt4 | CorrectAnswer
    const parts = block.split('|').map(s => s.trim());
    
    if (parts.length < 6) return null;

    return {
      id: `q-${index}-${Date.now()}`,
      originalIndex: index,
      q: parts[0],
      opt: {
        'ক': parts[1],
        'খ': parts[2],
        'গ': parts[3],
        'ঘ': parts[4]
      },
      a: parts[5]
    };
  }).filter((q): q is Question => q !== null);

  return parsed;
};