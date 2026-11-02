import * as React from 'react';
export interface BlueprintMaKetteProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Anfang". */
  text1?: string;
  /** Text content; defaults to "10.000 €". */
  text2?: string;
  /** Text content; defaults to "Eigenleistung". */
  text3?: string;
  /** Text content; defaults to "10.000 €". */
  text4?: string;
}
export declare const BlueprintMaKette: React.FC<BlueprintMaKetteProps>;
export default BlueprintMaKette;
