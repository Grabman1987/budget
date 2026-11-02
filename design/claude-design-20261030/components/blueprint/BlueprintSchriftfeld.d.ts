import * as React from 'react';
export interface BlueprintSchriftfeldProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "BLATT 02 / FINANZPLAN · REV 04". */
  text1?: string;
  /** Text content; defaults to "Oktober 2026". */
  text2?: string;
  /** Text content; defaults to "STAND 15.10.2026 / EUR". */
  text3?: string;
}
export declare const BlueprintSchriftfeld: React.FC<BlueprintSchriftfeldProps>;
export default BlueprintSchriftfeld;
