Primary action button (Zielsystem) — the one main action per region, e.g. "+ Buchung", "Speichern".

```jsx
const { ButtonPrimary } = window.BudgetBlueprintDesignSystem_63932b;
<ButtonPrimary style={{width:160}}>Speichern</ButtonPrimary>
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
