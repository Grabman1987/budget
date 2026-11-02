Register (tab) with 2px active underline — month/year views, sub-pages.

```jsx
const { Register } = window.BudgetBlueprintDesignSystem_63932b;
<Register text1="Monat" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
