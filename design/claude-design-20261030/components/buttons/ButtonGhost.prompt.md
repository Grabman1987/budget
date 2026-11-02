Ghost/text button for tertiary actions (Abbrechen, Herleitung zeigen); most-used button in the file.

```jsx
const { ButtonGhost } = window.BudgetBlueprintDesignSystem_63932b;
<ButtonGhost>Abbrechen</ButtonGhost>
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
