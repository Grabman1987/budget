import * as React from 'react';
export interface BlueprintStCklistenpositionProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "POS". */
  text1?: string;
  /** Text content; defaults to "BEZEICHNUNG". */
  text2?: string;
  /** Text content; defaults to "BETRAG". */
  text3?: string;
  /** Text content; defaults to "01". */
  text4?: string;
}
export declare const BlueprintStCklistenposition: React.FC<BlueprintStCklistenpositionProps>;
export default BlueprintStCklistenposition;
