'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Unico pezzo client della struttura di pagina: anima l'ingresso del contenuto,
 * che resta renderizzato sul server e arriva qui già pronto come `children`.
 */
export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
