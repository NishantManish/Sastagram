import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

export type TextStyle = {
  font: string;
  color: string;
  background: 'none' | 'solid' | 'translucent';
  backgroundColor?: string;
  backgroundOpacity?: number;
  alignment: 'left' | 'center' | 'right';
  fontSize: number;
  effect: 'none' | 'shadow' | 'glow' | 'outline' | 'neon' | '3d' | 'pixel' | 'retro';
};

interface TextEditorProps {
  initialText?: string;
  initialStyle?: TextStyle;
  onDone: (text: string, style: TextStyle) => void;
  onCancel: () => void;
}

const FONTS = [
  'Classic', 'Modern', 'Neon', 'Strong', 'Marker', 'Elegant', 'Tech', 'Comic',
  'Typewriter', 'Bangers', 'Script', 'Lobster', 'Pixel', 'Impact', 'Cursive'
];
const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
  '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50', '#8BC34A',
  '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#795548', '#9E9E9E', '#607D8B'
];

const EFFECTS: { id: TextStyle['effect'], label: string, icon: string }[] = [
  { id: 'none', label: 'None', icon: '∅' },
  { id: 'shadow', label: 'Shadow', icon: 'S' },
  { id: 'glow', label: 'Glow', icon: 'G' },
  { id: 'outline', label: 'Outline', icon: 'O' },
  { id: 'neon', label: 'Neon', icon: 'N' },
  { id: '3d', label: '3D', icon: '3' },
  { id: 'pixel', label: 'Pixel', icon: 'P' },
  { id: 'retro', label: 'Retro', icon: 'R' },
];

export default function TextEditor({ initialText = '', initialStyle, onDone, onCancel }: TextEditorProps) {
  const [text, setText] = useState(initialText);
  const [style, setStyle] = useState<TextStyle>(initialStyle || {
    font: 'Classic',
    color: '#FFFFFF',
    background: 'none',
    backgroundColor: '#000000',
    backgroundOpacity: 80,
    alignment: 'center',
    fontSize: 40,
    effect: 'none'
  });
  const [isEffectPickerOpen, setIsEffectPickerOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [text]);

  const toggleBackground = () => {
    const nextBg = style.background === 'none' ? 'solid' : 'none';
    setStyle({ ...style, background: nextBg });
  };

  const toggleAlignment = () => {
    const nextAlign = style.alignment === 'center' ? 'left' : style.alignment === 'left' ? 'right' : 'center';
    setStyle({ ...style, alignment: nextAlign });
  };

  const toggleEffect = () => {
    setIsEffectPickerOpen(!isEffectPickerOpen);
  };

  const AlignmentIcon = style.alignment === 'center' ? AlignCenter : style.alignment === 'left' ? AlignLeft : AlignRight;

  return (
    <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 pt-12">
        <div className="flex gap-4">
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={toggleAlignment} 
            className="w-10 h-10 flex items-center justify-center text-white bg-zinc-800/50 rounded-full"
          >
            <AlignmentIcon size={20} />
          </motion.button>
          <div className="relative">
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={toggleEffect} 
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isEffectPickerOpen ? 'bg-white text-black scale-110' : 'text-white bg-zinc-800/50'}`}
            >
              <span className="font-serif font-bold italic text-lg">E</span>
            </motion.button>
            
            <AnimatePresence>
              {isEffectPickerOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  className="absolute top-full left-0 mt-4 p-2 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[60] flex flex-col gap-1 min-w-[140px]"
                >
                  {EFFECTS.map(eff => (
                    <motion.button
                      key={eff.id}
                      whileHover={{ x: 5 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setStyle({ ...style, effect: eff.id });
                        setIsEffectPickerOpen(false);
                      }}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors ${style.effect === eff.id ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
                    >
                      <span className="w-6 h-6 flex items-center justify-center bg-zinc-800 rounded-lg text-xs font-bold">{eff.icon}</span>
                      <span className="text-sm font-semibold">{eff.label}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={toggleBackground} 
            className="w-10 h-10 flex items-center justify-center text-white font-serif border-2 border-white rounded-lg px-1 bg-zinc-800/50"
          >
            A*
          </motion.button>
        </div>
        <button onClick={() => onDone(text, style)} className="text-white font-semibold text-lg px-4 py-2 bg-zinc-800/50 rounded-full">
          Done
        </button>
      </div>

      {/* Text Input */}
      <div className="flex-1 flex items-center justify-center p-4 w-full relative">
        {/* Font Size Slider (Instagram Style) */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-10">
          <div className="relative h-64 w-8 flex items-center justify-center">
            {/* Track background */}
            <div className="absolute h-full w-1.5 bg-white/30 rounded-full" />
            {/* Track fill */}
            <div 
              className="absolute bottom-0 w-1.5 bg-white rounded-full pointer-events-none"
              style={{ height: `${((style.fontSize - 12) / (120 - 12)) * 100}%` }}
            />
            {/* Input */}
            <input
              type="range"
              min="12"
              max="120"
              value={style.fontSize}
              onChange={(e) => setStyle({ ...style, fontSize: parseInt(e.target.value) })}
              className="absolute w-64 h-8 origin-center -rotate-90 appearance-none bg-transparent cursor-pointer z-20
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_10px_rgba(0,0,0,0.5)] active:[&::-webkit-slider-thumb]:scale-125 [&::-webkit-slider-thumb]:transition-transform"
            />
          </div>
          <span className="text-[10px] font-bold text-white/80 uppercase tracking-tighter bg-black/50 px-2 py-1 rounded-md">Size</span>
        </div>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`w-full bg-transparent outline-none resize-none overflow-hidden text-center font-bold ${getFontClass(style.font)}`}
          style={{
            color: style.color,
            textAlign: style.alignment,
            fontSize: `${style.fontSize}px`,
            backgroundColor: getBgColor(style),
            padding: style.background !== 'none' ? '12px 24px' : '0',
            borderRadius: style.background !== 'none' ? '16px' : '0',
            textShadow: getTextShadow(style),
            WebkitTextStroke: getWebkitTextStroke(style),
          }}
          placeholder="Type something..."
          rows={1}
        />
      </div>

      {/* Bottom Controls */}
      <div className="pb-8 flex flex-col gap-2">
        {/* Background Color & Opacity Controls */}
        {style.background !== 'none' && (
          <div className="px-6 py-2 flex flex-col gap-3 bg-zinc-900/80 mx-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-white/50 uppercase w-16">Opacity</span>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={style.backgroundOpacity ?? 100} 
                onChange={e => setStyle({...style, backgroundOpacity: parseInt(e.target.value)})} 
                className="flex-1 accent-white" 
              />
              <span className="text-xs text-white/50 w-8 text-right">{style.backgroundOpacity ?? 100}%</span>
            </div>
            <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-2">
              <span className="text-xs font-bold text-white/50 uppercase w-16 shrink-0">Bg Color</span>
              <div className="relative w-8 h-8 shrink-0 rounded-full overflow-hidden border-2 border-white/20">
                <input 
                  type="color" 
                  value={style.backgroundColor || '#000000'} 
                  onChange={e => setStyle({...style, backgroundColor: e.target.value})} 
                  className="absolute -inset-2 w-12 h-12 cursor-pointer" 
                />
              </div>
              {COLORS.map(c => (
                <motion.button
                  key={`bg-${c}`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setStyle({ ...style, backgroundColor: c })}
                  className={`w-8 h-8 rounded-full flex-shrink-0 border-2 transition-all ${style.backgroundColor === c ? 'border-white scale-125 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Colors */}
        <div className="flex gap-4 overflow-x-auto px-6 py-2 no-scrollbar">
          <span className="text-xs font-bold text-white/50 uppercase w-16 shrink-0 flex items-center">Text</span>
          {COLORS.map(c => (
            <motion.button
              key={`text-${c}`}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setStyle({ ...style, color: c })}
              className={`w-8 h-8 rounded-full flex-shrink-0 border-2 transition-all ${style.color === c ? 'border-white scale-125 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {/* Fonts */}
        <div className="flex gap-4 overflow-x-auto px-6 py-2 no-scrollbar">
          {FONTS.map(f => (
            <motion.button
              key={f}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setStyle({ ...style, font: f })}
              className={`px-4 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white transition-all border border-transparent ${style.font === f ? 'bg-white text-black scale-110 shadow-lg !border-white' : 'bg-zinc-900 border-white/10 hover:bg-zinc-800'}`}
            >
              <span className={`text-xl leading-none ${getFontClass(f)}`}>Aa</span>
              <span className="text-[10px] uppercase font-bold opacity-60 ml-3 tracking-widest font-sans">{f}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function getFontClass(font: string) {
  switch (font) {
    case 'Typewriter': return 'font-typewriter';
    case 'Modern': return 'font-modern uppercase tracking-wider';
    case 'Neon': return 'font-neon'; 
    case 'Strong': return 'font-serif font-bold italic';
    case 'Marker': return 'font-marker italic tracking-tighter';
    case 'Elegant': return 'font-serif font-light tracking-widest';
    case 'Tech': return 'font-tech tracking-widest uppercase';
    case 'Comic': return 'font-bangers tracking-wide';
    case 'Bangers': return 'font-bangers';
    case 'Script': return 'font-script';
    case 'Lobster': return 'font-lobster';
    case 'Pixel': return 'font-pixel text-[0.7em]';
    case 'Impact': return 'font-impact uppercase';
    case 'Cursive': return 'font-cursive';
    default: return 'font-sans font-bold';
  }
}

export function getTextShadow(style: TextStyle) {
  const color = style.color;
  switch (style.effect) {
    case 'glow': return `0 0 10px ${color}, 0 0 20px ${color}`;
    case 'neon': return `0 0 5px #fff, 0 0 10px #fff, 0 0 20px ${color}, 0 0 30px ${color}, 0 0 40px ${color}`;
    case 'shadow': return '4px 4px 0px rgba(0,0,0,0.5)';
    case '3d': return `1px 1px 0px #ccc, 2px 2px 0px #bbb, 3px 3px 0px #aaa, 4px 4px 0px rgba(0,0,0,0.5)`;
    case 'pixel': return `2px 2px 0px #000`;
    case 'retro': return `2px 2px 0px #ff00ff, -2px -2px 0px #00ffff`;
    default: return style.font === 'Neon' ? `0 0 10px ${color}, 0 0 20px ${color}` : 'none';
  }
}

export function getWebkitTextStroke(style: TextStyle) {
  if (style.effect === 'outline') return `2px ${style.background === 'solid' ? '#fff' : '#000'}`;
  return 'none';
}

export function getBgColor(style: TextStyle) {
  if (style.background === 'none') return 'transparent';
  const hex = style.backgroundColor || style.color || '#000000';
  const opacity = style.backgroundOpacity !== undefined ? style.backgroundOpacity : (style.background === 'translucent' ? 50 : 100);
  
  let r = 0, g = 0, b = 0;
  if (hex.startsWith('#')) {
    r = parseInt(hex.slice(1, 3), 16) || 0;
    g = parseInt(hex.slice(3, 5), 16) || 0;
    b = parseInt(hex.slice(5, 7), 16) || 0;
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}
