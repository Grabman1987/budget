import * as React from 'react';
export interface StatusAbgeglichenProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Abgeglichen". */
  text1?: string;
}
export declare const StatusAbgeglichen: React.FC<StatusAbgeglichenProps>;
export default StatusAbgeglichen;
