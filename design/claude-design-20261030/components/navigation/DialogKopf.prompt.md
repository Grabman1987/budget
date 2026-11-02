Dialog header (540px form dialog) with title and close.

```jsx
const { DialogKopf } = window.BudgetBlueprintDesignSystem_63932b;
<DialogKopf text1="Buchung bearbeiten" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
