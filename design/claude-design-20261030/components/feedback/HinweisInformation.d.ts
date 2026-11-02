import * as React from 'react';
export interface HinweisInformationProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Datenbasis und nächste Aktion.". */
  text1?: string;
}
export declare const HinweisInformation: React.FC<HinweisInformationProps>;
export default HinweisInformation;
