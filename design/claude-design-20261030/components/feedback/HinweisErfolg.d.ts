import * as React from 'react';
export interface HinweisErfolgProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Gespeichert. Rückgängig verfügbar.". */
  text1?: string;
}
export declare const HinweisErfolg: React.FC<HinweisErfolgProps>;
export default HinweisErfolg;
