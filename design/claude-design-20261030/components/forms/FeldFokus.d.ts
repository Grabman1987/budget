import * as React from 'react';
export interface FeldFokusProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Feldbezeichnung". */
  text1?: string;
  /** Text content; defaults to "Musterwert". */
  text2?: string;
}
export declare const FeldFokus: React.FC<FeldFokusProps>;
export default FeldFokus;
