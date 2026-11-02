import * as React from 'react';
export interface HinweisAchtungProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Angabe prüfen, bevor du fortfährst.". */
  text1?: string;
}
export declare const HinweisAchtung: React.FC<HinweisAchtungProps>;
export default HinweisAchtung;
