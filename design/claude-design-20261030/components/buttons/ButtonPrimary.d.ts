import * as React from 'react';
export interface ButtonPrimaryProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Aktion". */
  text1?: string;
}
export declare const ButtonPrimary: React.FC<ButtonPrimaryProps>;
export default ButtonPrimary;
