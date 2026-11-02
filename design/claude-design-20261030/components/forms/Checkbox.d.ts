import * as React from 'react';
export interface CheckboxProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Auswahl". */
  text1?: string;
}
export declare const Checkbox: React.FC<CheckboxProps>;
export default Checkbox;
