import * as React from 'react';
export interface ButtonSecondaryProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Aktion". */
  text1?: string;
}
export declare const ButtonSecondary: React.FC<ButtonSecondaryProps>;
export default ButtonSecondary;
