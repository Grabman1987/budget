import * as React from 'react';
export interface ButtonGhostProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Aktion". */
  text1?: string;
}
export declare const ButtonGhost: React.FC<ButtonGhostProps>;
export default ButtonGhost;
