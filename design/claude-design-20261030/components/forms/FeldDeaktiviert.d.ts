import * as React from 'react';
export interface FeldDeaktiviertProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Feldbezeichnung". */
  text1?: string;
  /** Text content; defaults to "Nicht verfügbar". */
  text2?: string;
}
export declare const FeldDeaktiviert: React.FC<FeldDeaktiviertProps>;
export default FeldDeaktiviert;
