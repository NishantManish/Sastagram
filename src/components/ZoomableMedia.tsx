import React, { useState, useRef } from 'react';
import { motion, useAnimation } from 'motion/react';
import { usePinch, useDrag } from '@use-gesture/react';

interface ZoomableMediaProps {
  children: React.ReactNode;
  className?: string;
}

export default function ZoomableMedia({ children, className }: ZoomableMediaProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const controls = useAnimation();
  const containerRef = useRef<HTMLDivElement>(null);

  const bind = usePinch(({ offset: [d], active }) => {
    const newScale = Math.max(1, 1 + d / 100);
    setScale(newScale);
    if (!active) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      controls.start({ 
        scale: 1, 
        x: 0, 
        y: 0, 
        transition: { type: 'spring', stiffness: 300, damping: 30 } 
      });
    }
  }, {
    pointer: { touch: true },
  });

  const dragBind = useDrag(({ offset: [x, y], active }) => {
    if (scale > 1) {
      setPosition({ x, y });
      if (!active) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        controls.start({ 
          scale: 1, 
          x: 0, 
          y: 0, 
          transition: { type: 'spring', stiffness: 300, damping: 30 } 
        });
      }
    }
  }, {
    enabled: scale > 1,
  });

  return (
    <div 
      ref={containerRef}
      {...bind()} 
      {...dragBind()}
      className={`relative overflow-hidden ${className}`}
      style={{ touchAction: scale > 1 ? 'none' : 'pan-y' }}
    >
      <motion.div
        animate={controls}
        style={{ scale, x: position.x, y: position.y }}
        className="w-full h-full flex items-center justify-center"
      >
        {children}
      </motion.div>
    </div>
  );
}
