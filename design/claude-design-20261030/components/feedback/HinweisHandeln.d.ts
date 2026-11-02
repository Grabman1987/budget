import * as React from 'react';
export interface HinweisHandelnProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Eine Entscheidung ist erforderlich.". */
  text1?: string;
}
export declare const HinweisHandeln: React.FC<HinweisHandelnProps>;
export default HinweisHandeln;
