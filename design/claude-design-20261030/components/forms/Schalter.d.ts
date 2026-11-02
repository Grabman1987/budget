import * as React from 'react';
export interface SchalterProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Aktiviert". */
  text1?: string;
}
export declare const Schalter: React.FC<SchalterProps>;
export default Schalter;
