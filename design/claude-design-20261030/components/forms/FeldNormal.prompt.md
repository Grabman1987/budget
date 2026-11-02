Text field with label above, 44px input, 8px radius, field stroke — default state.

```jsx
const { FeldNormal } = window.BudgetBlueprintDesignSystem_63932b;
<FeldNormal text1="Empfänger" text2="REWE" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
