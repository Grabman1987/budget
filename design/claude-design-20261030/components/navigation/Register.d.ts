import * as React from 'react';
export interface RegisterProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  children?: React.ReactNode;
  /** Text content; defaults to "Monat". */
  text1?: string;
}
export declare const Register: React.FC<RegisterProps>;
export default Register;
