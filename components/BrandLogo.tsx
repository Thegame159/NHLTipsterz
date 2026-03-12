// src/components/BrandLogo.tsx

import React from 'react';

interface Props {
  size?: 'sm' | 'lg';
}

const BrandLogo: React.FC<Props> = ({ size = 'sm' }) => {
  const isLarge = size === 'lg';

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${
        isLarge ? 'p-6 scale-90 sm:scale-100' : 'p-1 scale-[0.5] sm:scale-[0.65]'
      } overflow-visible`}
    >
      <div className={`absolute left-[-20%] w-[140%] pointer-events-none ${isLarge ? 'top-[45%]' : 'top-[42%]'}`}>
        <svg viewBox="0 0 400 50" className="w-full h-auto opacity-100 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]">
          <path d="M 0 25 Q 200 35 400 22" stroke="#f97316" strokeWidth="1.2" fill="transparent" />
          <path d="M 10 32 Q 205 42 390 30" stroke="#f97316" strokeWidth="1.8" fill="transparent" />
          <path d="M 20 38 Q 210 48 380 36" stroke="#f97316" strokeWidth="2.2" fill="transparent" />
          <path d="M 35 44 Q 215 54 365 44" stroke="#f97316" strokeWidth="1.0" fill="transparent" opacity="0.6" />
        </svg>
      </div>

      <div className="relative flex items-center">
        <h1
          className={`${
            isLarge ? 'text-[100px] sm:text-[160px]' : 'text-[80px] sm:text-[100px]'
          } font-nhl-block text-white relative z-10 leading-none tracking-tight`}
        >
          NHL
        </h1>

        <div
          className={`absolute z-30 transform rotate-[-12deg] ${
            isLarge
              ? 'right-[-45px] sm:right-[-60px] top-[10px] sm:top-[15px]'
              : 'right-[-35px] top-[8px]'
          }`}
        >
          <div
            className={`${
              isLarge ? 'w-36 h-20 sm:w-44 sm:h-28' : 'w-24 h-14'
            } bg-[#1a1a1a] rounded-full shadow-[0_10px_20px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.1)] border-b-[6px] border-black relative overflow-hidden flex items-center justify-center`}
          >
            <div className={`${isLarge ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-12 h-12'} relative flex flex-col items-center justify-center`}>
              <svg viewBox="0 0 100 100" className="w-full h-full p-2">
                <path d="M 50 20 L 25 75 L 38 75 L 50 55 L 62 75 L 75 75 Z" fill="white" />
                <rect x="60" y="65" width="22" height="8" fill="#ea580c" rx="1" />
              </svg>
            </div>
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent" />
          </div>
        </div>
      </div>

      <div className={`z-40 ${isLarge ? 'mt-[-40px] sm:mt-[-55px] ml-16 sm:ml-24' : 'mt-[-35px] ml-14'}`}>
        <span
          className={`${
            isLarge ? 'text-[65px] sm:text-[90px]' : 'text-[55px] sm:text-[65px]'
          } font-tipsterz text-white drop-shadow-[0_3px_6px_rgba(0,0,0,1)]`}
        >
          Tipsterz
        </span>
      </div>
    </div>
  );
};

export default BrandLogo;
