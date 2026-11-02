import * as React from 'react';
export interface StatusGesperrtProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Gesperrt". */
  text1?: string;
}
export declare const StatusGesperrt: React.FC<StatusGesperrtProps>;
export default StatusGesperrt;
