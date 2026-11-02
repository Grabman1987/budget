Selectable list row: name, meta line, right-aligned amount.

```jsx
const { ZeileAuswHlbar } = window.BudgetBlueprintDesignSystem_63932b;
<ZeileAuswHlbar text1="Lebensmittel" text2="Zugewiesen 420,00 €" text3="130,00 €" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
