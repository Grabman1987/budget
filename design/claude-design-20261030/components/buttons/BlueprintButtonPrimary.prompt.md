Blueprint V3 primary button on the dark canvas (e.g. "Geld verteilen" in the Plan title block).

```jsx
const { BlueprintButtonPrimary } = window.BudgetBlueprintDesignSystem_63932b;
<BlueprintButtonPrimary text1="Geld verteilen" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
