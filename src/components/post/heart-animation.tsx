'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HeartAnimationProps {
  trigger: number;
  onComplete?: () => void;
}

export function HeartAnimation({ trigger, onComplete }: HeartAnimationProps) {
  const [visible, setVisible] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (trigger > 0) {
      setKey(trigger);
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [trigger, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={key}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Main heart */}
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="white"
            className="w-20 h-20 drop-shadow-lg"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.3, 1],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 0.8,
              times: [0, 0.3, 0.6, 1],
              ease: 'easeOut',
            }}
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </motion.svg>

          {/* Particle hearts */}
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i * 60) * (Math.PI / 180);
            const distance = 50 + Math.random() * 20;
            return (
              <motion.svg
                key={i}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="white"
                className="absolute w-4 h-4 drop-shadow-sm"
                initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                animate={{
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0],
                  x: Math.cos(angle) * distance,
                  y: Math.sin(angle) * distance,
                }}
                transition={{
                  duration: 0.6,
                  delay: 0.1,
                  ease: 'easeOut',
                }}
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </motion.svg>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
