Progress bar with label/value line — savings goals, budget use.

```jsx
const { Fortschritt } = window.BudgetBlueprintDesignSystem_63932b;
<Fortschritt text1="600 / 1.500 € · 40 %" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
