Text field in error state with Rotstift message below.

```jsx
const { FeldFehler } = window.BudgetBlueprintDesignSystem_63932b;
<FeldFehler text1="Kategorie" text3="Bitte eine Kategorie wählen." />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
