import { Button, FormDialog, type PanelProps } from '@budget/ui';
import './settings-form-dialog.css';

/** Settings forms keep the native dialog's focus/close contract and one scrolling body. */
export function SettingsFormDialog({ children, ...props }: PanelProps) {
  const close = () => {
    if (!props.beforeClose || props.beforeClose()) props.onClose();
  };
  return (
    <FormDialog {...props}>
      {props.open && (
        <>
          <div className="bk-head panel-head settings-form-head">
            <h2>{props.title}</h2>
            <Button variant="ghost" onClick={close}>
              Schließen
            </Button>
          </div>
          <div className="bk-body panel-body">{children}</div>
        </>
      )}
    </FormDialog>
  );
}
