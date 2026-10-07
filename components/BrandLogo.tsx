// components/BrandLogo.tsx
// Logótipo oficial (imagem). O fundo da imagem tem exatamente a cor do site (#020617),
// por isso integra-se sem moldura em qualquer ecrã com esse fundo.

import React from 'react';

interface Props {
  size?: 'sm' | 'lg';
}

const BrandLogo: React.FC<Props> = ({ size = 'sm' }) => {
  const isLarge = size === 'lg';

  return (
    <img
      src="/logo-tipsterz.webp"
      alt="NHL Tipsterz"
      width={902}
      height={578}
      draggable={false}
      className={`select-none block w-auto ${isLarge ? 'h-44 sm:h-60' : 'h-20 sm:h-24'}`}
    />
  );
};

export default BrandLogo;
