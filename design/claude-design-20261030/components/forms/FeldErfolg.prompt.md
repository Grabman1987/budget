Text field in validated/success state.

```jsx
const { FeldErfolg } = window.BudgetBlueprintDesignSystem_63932b;
<FeldErfolg text1="IBAN" text2="AT61 …" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
