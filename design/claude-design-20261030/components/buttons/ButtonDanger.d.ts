import * as React from 'react';
export interface ButtonDangerProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Aktion". */
  text1?: string;
}
export declare const ButtonDanger: React.FC<ButtonDangerProps>;
export default ButtonDanger;
