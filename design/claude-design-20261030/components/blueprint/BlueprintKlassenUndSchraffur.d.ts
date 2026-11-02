import * as React from 'react';
export interface BlueprintKlassenUndSchraffurProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Bedarf". */
  text1?: string;
  /** Text content; defaults to "Wunsch". */
  text2?: string;
  /** Text content; defaults to "Zukunft". */
  text3?: string;
}
export declare const BlueprintKlassenUndSchraffur: React.FC<BlueprintKlassenUndSchraffurProps>;
export default BlueprintKlassenUndSchraffur;
