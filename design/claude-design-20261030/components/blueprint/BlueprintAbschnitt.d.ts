import * as React from 'react';
export interface BlueprintAbschnittProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "01". */
  text1?: string;
  /** Text content; defaults to "Positionen und Herkunft". */
  text2?: string;
}
export declare const BlueprintAbschnitt: React.FC<BlueprintAbschnittProps>;
export default BlueprintAbschnitt;
