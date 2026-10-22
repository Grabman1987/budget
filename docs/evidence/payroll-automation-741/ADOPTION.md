# Payroll automation adoption: existing-test compatibility

| Existing file | Technical adaptation | Authority and preserved checks |
| --- | --- | --- |
| `apps/web/src/reports/payslip-intake.test.tsx` | Wrap the existing dropped-PDF `PayslipUpload` render in `ToastProvider`, inside its retained `QueryClientProvider`. | Owner-authorized technical test adaptation for #741, applied by the coordinator delegate. The upload now uses the existing `useBudgetWrite` hook for financial-group Undo; this hook requires the same toast provider as runtime and the new component tests. Every test action, expectation, financial oracle and timeout remains unchanged. |

Root's compatibility validation on source `e9815933` found this missing provider before the existing dropped-PDF test reached its actions. The five other compatibility files passed; this change supplies context only and requires independent delta review and rerun. Logs: `/workspace/.budget-tools/cloud-control/sprint-20261022/payroll-compatibility.log` (outside repository).
