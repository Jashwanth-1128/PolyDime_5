import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface Book3DProps {
  title: string;
  author?: string;
  coverImage?: string;
  onOpen: () => void;
  isLoading?: boolean;
}

export const Book3D: React.FC<Book3DProps> = ({ title, author, coverImage, onOpen, isLoading }) => {
  return (
    <div className="perspective-[2000px] w-[min(90vw,260px)] h-[min(80vh,340px)] sm:w-[min(90vw,300px)] sm:h-[min(80vh,400px)] relative group cursor-pointer" onClick={!isLoading ? onOpen : undefined}>
      <motion.div
        initial={{ rotateY: -30, rotateX: 10 }}
        animate={{ 
          rotateY: isLoading ? [-30, -20, -30] : -30,
          rotateX: isLoading ? [10, 15, 10] : 10,
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        whileHover={{ rotateY: -10, rotateX: 5, scale: 1.05 }}
        className="w-full h-full relative preserve-3d transition-transform duration-700"
      >
        {/* Spine */}
        <div className="absolute left-0 top-0 w-[40px] h-full bg-background border-r border-white-soft/10 origin-left -rotate-y-90 translate-x-0 z-10 flex flex-col items-center justify-center py-8 shadow-[inset_-10px_0_20px_rgba(0,0,0,0.5)]">
          <div className="writing-mode-vertical-rl rotate-180 text-[10px] font-display uppercase tracking-widest text-accent font-bold whitespace-nowrap opacity-60">
            {title}
          </div>
        </div>

        {/* Front Cover */}
        <div className={cn(
          "absolute inset-0 w-full h-full rounded-r-lg overflow-hidden border border-white-soft/10 shadow-2xl preserve-3d",
          "bg-gradient-to-br from-background via-[#2a282a] to-background"
        )}>
          {coverImage ? (
            <div className="absolute inset-0">
              <img 
                src={coverImage} 
                alt={title} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/20" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-accent/5" />
          )}
          
          <div className={cn(
            "absolute inset-0 p-8 flex flex-col justify-between border-r-4 border-accent/20",
            coverImage ? "bg-gradient-to-t from-background/90 via-background/20 to-transparent" : ""
          )}>
            <div className="space-y-4">
              <div className="w-12 h-1 bg-accent" />
              {author && (
                <p className="text-accent text-xs font-display uppercase tracking-[0.2em] font-medium opacity-100 drop-shadow-md">
                  {author}
                </p>
              )}
            </div>

            <div className="flex items-end justify-between">
              <div className="text-[8px] font-mono text-white-soft/60 uppercase tracking-widest drop-shadow-md">
                Flipverse Edition<br />
                Technical Archive
              </div>
              <div className="w-8 h-8 rounded-full border border-accent/30 flex items-center justify-center bg-background/40 backdrop-blur-sm">
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
              </div>
            </div>
          </div>

          {/* Glossy overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white-soft/5 to-transparent pointer-events-none" />
        </div>

        {/* Pages (Side) */}
        <div className="absolute right-0 top-0 w-[35px] h-full bg-[#e0e0e0] origin-right rotate-y-90 translate-x-0 z-0 flex flex-col gap-[1px] p-[1px] overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="flex-1 bg-white-soft/20 border-b border-black/5" />
          ))}
        </div>

        {/* Bottom */}
        <div className="absolute left-0 bottom-0 w-full h-[35px] bg-[#d0d0d0] origin-bottom rotate-x-90 translate-y-0 z-0" />
      </motion.div>

      {/* Shadow */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[80%] h-10 bg-black/40 blur-2xl rounded-full -z-10" />
    </div>
  );
};
