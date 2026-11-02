Text field in focus state (primary stroke + tint ring).

```jsx
const { FeldFokus } = window.BudgetBlueprintDesignSystem_63932b;
<FeldFokus text1="Betrag" text2="−42,90 €" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
