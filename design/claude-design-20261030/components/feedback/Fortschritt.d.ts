import * as React from 'react';
export interface FortschrittProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "600 / 1.500 € · 40 %". */
  text1?: string;
}
export declare const Fortschritt: React.FC<FortschrittProps>;
export default Fortschritt;
