import * as React from 'react';
export interface StatusVorgemerktProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Vorgemerkt". */
  text1?: string;
}
export declare const StatusVorgemerkt: React.FC<StatusVorgemerktProps>;
export default StatusVorgemerkt;
