import * as React from 'react';
export interface FeldFehlerProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Feldbezeichnung". */
  text1?: string;
  /** Text content; defaults to "Musterwert". */
  text2?: string;
  /** Text content; defaults to "Bitte eine gültige Angabe machen.". */
  text3?: string;
}
export declare const FeldFehler: React.FC<FeldFehlerProps>;
export default FeldFehler;
