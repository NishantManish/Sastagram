import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation } from 'motion/react';
import { usePinch } from '@use-gesture/react';

interface ZoomableMediaProps {
  children: React.ReactNode;
  className?: string;
}

export default function ZoomableMedia({ children, className }: ZoomableMediaProps) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.5 });
  const controls = useAnimation();
  const containerRef = useRef<HTMLDivElement>(null);

  const bind = usePinch(({ offset: [d], origin: [ox, oy], memo, active }) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (ox - rect.left) / rect.width;
      const y = (oy - rect.top) / rect.height;
      
      if (!memo) {
        setOrigin({ x, y });
      }
    }

    const newScale = Math.max(1, 1 + d / 100);
    setScale(newScale);

    if (!active) {
      // Spring back to 1
      controls.start({
        scale: 1,
        transition: { type: 'spring', stiffness: 300, damping: 30 }
      });
      setScale(1);
    }

    return memo || true;
  }, {
    pointer: { touch: true },
  });

  return (
    <div 
      ref={containerRef}
      {...bind()} 
      className={`relative overflow-hidden ${className}`}
      style={{ touchAction: scale > 1 ? 'none' : 'pan-y' }}
    >
      <motion.div
        animate={controls}
        style={{ 
          scale,
          originX: origin.x,
          originY: origin.y,
        }}
        className="w-full h-full flex items-center justify-center"
      >
        {children}
      </motion.div>
    </div>
  );
}
