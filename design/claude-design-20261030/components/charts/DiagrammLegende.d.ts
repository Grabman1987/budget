import * as React from 'react';
export interface DiagrammLegendeProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Ist". */
  text1?: string;
  /** Text content; defaults to "Prognose". */
  text2?: string;
}
export declare const DiagrammLegende: React.FC<DiagrammLegendeProps>;
export default DiagrammLegende;
