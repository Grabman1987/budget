import * as React from 'react';
export interface StatusBestTigtProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Bestätigt". */
  text1?: string;
}
export declare const StatusBestTigt: React.FC<StatusBestTigtProps>;
export default StatusBestTigt;
