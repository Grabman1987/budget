import * as React from 'react';
export interface BlueprintButtonPrimaryProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Geld verteilen". */
  text1?: string;
}
export declare const BlueprintButtonPrimary: React.FC<BlueprintButtonPrimaryProps>;
export default BlueprintButtonPrimary;
