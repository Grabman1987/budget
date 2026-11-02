Prüfbadge pill — account check state; variants status="geprüft" | "fällig".

```jsx
const { PrFbadge } = window.BudgetBlueprintDesignSystem_63932b;
<PrFbadge status="fällig" text="Fällig · seit 12 T." />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
